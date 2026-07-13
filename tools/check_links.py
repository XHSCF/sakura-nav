#!/usr/bin/env python3
"""Generate a report-only health check for navigation links.

Usage:
  python tools/check_links.py
  python tools/check_links.py --output link-health-report.md
"""

from __future__ import annotations

import argparse
import concurrent.futures
import re
import socket
import ssl
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "assets/js/sites-data.js"
DEFAULT_OUTPUT = ROOT / "link-health-report.md"
USER_AGENT = "SAKURA-Link-Health/1.0 (+https://skrto.top/)"
SITE_RE = re.compile(r'\{(?=[^{}]*\bid:\s*")[^{}]*\burl:\s*"[^{}]+?\bcategory:\s*"[^{}]+?\}')


@dataclass(frozen=True)
class Site:
    name: str
    url: str
    category: str


@dataclass(frozen=True)
class Observation:
    code: int | None
    final_url: str
    headers: dict[str, str]
    error: str = ""


@dataclass(frozen=True)
class Result:
    site: Site
    final_url: str
    status: str
    detail: str
    suggestion: str


def field(block: str, name: str) -> str:
    match = re.search(rf'\b{re.escape(name)}\s*:\s*"([^"]*)"', block)
    return match.group(1).strip() if match else ""


def load_sites(path: Path = DATA_FILE) -> list[Site]:
    text = path.read_text(encoding="utf-8")
    category_text = text.split("sites: [", 1)[0]
    category_names = {
        match.group(1): match.group(2)
        for match in re.finditer(r'\bid:\s*"([a-z0-9-]+)"\s*,\s*name:\s*"([^"]+)"', category_text)
    }
    sites = []
    for block in SITE_RE.findall(text):
        category_id = field(block, "category")
        site = Site(
            name=field(block, "name"),
            url=field(block, "url"),
            category=category_names.get(category_id, category_id),
        )
        if not all((site.name, site.url, site.category)):
            raise ValueError(f"无法解析网站条目：{block[:120]}")
        sites.append(site)
    if not sites:
        raise ValueError(f"未从 {path} 读取到网站条目")
    return sites


def request_once(url: str, method: str, timeout: float) -> Observation:
    request = Request(
        url,
        method=method,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/octet-stream;q=0.8,*/*;q=0.5",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            if method == "GET":
                response.read(4096)
            return Observation(
                code=response.status,
                final_url=response.geturl(),
                headers={key.lower(): value for key, value in response.headers.items()},
            )
    except HTTPError as error:
        if method == "GET":
            error.read(4096)
        return Observation(
            code=error.code,
            final_url=error.geturl() or url,
            headers={key.lower(): value for key, value in error.headers.items()},
            error=str(error.reason or error),
        )
    except (URLError, TimeoutError, socket.timeout, ssl.SSLError, OSError) as error:
        reason = error.reason if isinstance(error, URLError) else error
        return Observation(code=None, final_url=url, headers={}, error=describe_error(reason))


def describe_error(error: object) -> str:
    if isinstance(error, (TimeoutError, socket.timeout)):
        return "请求超时"
    if isinstance(error, socket.gaierror):
        return f"DNS 解析失败：{error}"
    if isinstance(error, ssl.SSLError):
        return f"证书或 TLS 错误：{error}"
    text = str(error).strip() or error.__class__.__name__
    lowered = text.lower()
    if "timed out" in lowered:
        return "请求超时"
    if "certificate" in lowered or "ssl" in lowered or "tls" in lowered:
        return f"证书或 TLS 错误：{text}"
    if "name or service not known" in lowered or "getaddrinfo" in lowered:
        return f"DNS 解析失败：{text}"
    return text


def fetch(url: str, timeout: float) -> Observation:
    observation = request_once(url, "HEAD", timeout)
    if observation.code in {405, 501}:
        return request_once(url, "GET", timeout)
    return observation


def cloudflare_or_antibot(observation: Observation) -> bool:
    headers = observation.headers
    server = headers.get("server", "").lower()
    return bool(headers.get("cf-ray") or "cloudflare" in server)


def https_version(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(("https", parts.netloc, parts.path, parts.query, parts.fragment))


def check_site(site: Site, timeout: float) -> Result:
    observation = fetch(site.url, timeout)
    code = observation.code
    detail = str(code) if code is not None else observation.error

    if code in {403, 429} or (code in {403, 429, 503} and cloudflare_or_antibot(observation)):
        return Result(site, observation.final_url, "需要人工确认", detail, "可能存在访问限制、Cloudflare 验证或反爬策略，请在正常浏览器和目标地区人工复核。")
    if code is None:
        return Result(site, observation.final_url, "连接失败", detail, "检查 DNS、证书、网络可达性或稍后重试；不要仅凭单次结果删除条目。")
    if 400 <= code < 500:
        return Result(site, observation.final_url, "4xx", detail, "人工确认链接、权限、地区限制及站点访问策略。")
    if code >= 500:
        return Result(site, observation.final_url, "5xx", detail, "站点可能暂时故障，稍后重试并人工确认。")

    original = urlsplit(site.url)
    final = urlsplit(observation.final_url)
    redirected = observation.final_url.rstrip("/") != site.url.rstrip("/")
    if original.scheme == "http" and final.scheme != "https":
        https_observation = fetch(https_version(site.url), timeout)
        if https_observation.code is not None and 200 <= https_observation.code < 400:
            return Result(site, https_observation.final_url, "HTTP 可访问但可升级 HTTPS", f"HTTP {code}；HTTPS {https_observation.code}", "人工确认 HTTPS 地址长期稳定后，再决定是否更新导航数据。")
    if redirected:
        suggestion = "人工确认最终网址是否为长期稳定的新地址；报告不会自动替换原网址。"
        if original.scheme == "http" and final.scheme == "https":
            suggestion = "已重定向到 HTTPS；人工确认长期稳定后，再决定是否更新导航数据。"
        return Result(site, observation.final_url, "发生重定向", detail, suggestion)
    if original.scheme == "http":
        return Result(site, observation.final_url, "正常（HTTP）", detail, "当前 HTTP 地址可访问；保留原值并定期人工复核 HTTPS 支持情况。")
    return Result(site, observation.final_url, "正常", detail, "无需处理。")


def markdown_cell(value: object) -> str:
    return str(value or "—").replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def build_report(results: list[Result]) -> str:
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    counts: dict[str, int] = {}
    for result in results:
        counts[result.status] = counts.get(result.status, 0) + 1
    summary = "；".join(f"{status} {count}" for status, count in sorted(counts.items()))
    lines = [
        "# SAKURA 导航链接健康报告",
        "",
        f"- 生成时间：{generated}",
        f"- 检查数量：{len(results)}",
        f"- 状态汇总：{summary or '无结果'}",
        "- 说明：本报告只提供人工复核线索，不会自动删除、替换或提交网站数据。",
        "",
        "| 网站名称 | 原始网址 | 最终网址 | 状态 | 状态码或错误 | 分类 | 建议人工处理方式 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        lines.append("| " + " | ".join(markdown_cell(value) for value in (
            result.site.name,
            result.site.url,
            result.final_url,
            result.status,
            result.detail,
            result.site.category,
            result.suggestion,
        )) + " |")
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查 SAKURA 导航链接并生成只读 Markdown 报告。")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Markdown 报告路径（默认：仓库根目录 link-health-report.md）")
    parser.add_argument("--timeout", type=float, default=15.0, help="单次请求超时秒数（默认：15）")
    parser.add_argument("--workers", type=int, default=6, help="最大并发数（默认：6，范围：1-12）")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workers = min(12, max(1, args.workers))
    sites = load_sites()
    results_by_url: dict[str, Result] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(check_site, site, args.timeout): site for site in sites}
        for future in concurrent.futures.as_completed(futures):
            site = futures[future]
            try:
                results_by_url[site.url] = future.result()
            except Exception as error:  # Preserve a complete report if one worker fails unexpectedly.
                results_by_url[site.url] = Result(site, site.url, "检查异常", describe_error(error), "检查脚本出现异常，请人工复核并重新运行。")
    results = [results_by_url[site.url] for site in sites]
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(build_report(results), encoding="utf-8")
    print(f"链接检查完成：{len(results)} 个网站，报告已写入 {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
