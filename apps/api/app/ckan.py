from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


@dataclass(frozen=True)
class Resource:
    id: str
    name: str
    format: str
    url: str
    package_name: str = ""
    package_title: str = ""
    mimetype: str = ""


def discover_resources(
    session: requests.Session,
    dataset_url: str,
    resource_ids: list[str] | None = None,
    tag: str = "acidente de trabalho",
) -> list[Resource]:
    selected_ids = {resource_id.strip() for resource_id in resource_ids or [] if resource_id.strip()}

    tagged_resources = _discover_tagged_resources(session, dataset_url, tag)
    if tagged_resources:
        return _filter_selected(_dedupe(_filter_supported(tagged_resources)), selected_ids)

    package_resources = _discover_package_resources(session, dataset_url)
    if package_resources:
        return _filter_selected(_dedupe(_filter_supported(package_resources)), selected_ids)

    ids_from_page = _extract_resource_ids(session, dataset_url)
    resources: list[Resource] = []

    for resource_id in selected_ids or set(ids_from_page):
        resource = _fetch_ckan_resource(session, dataset_url, resource_id)
        if resource:
            resources.append(resource)

    return _discover_direct_links(session, dataset_url, selected_ids)


def _discover_tagged_resources(
    session: requests.Session,
    dataset_url: str,
    tag: str,
) -> list[Resource]:
    if not tag.strip():
        return []

    api_url = _api_action_url(dataset_url, "package_search")
    response = session.get(
        api_url,
        params={"q": f'tags:"{tag}"', "rows": 100},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()

    if not payload.get("success"):
        return []

    resources: list[Resource] = []
    for package in payload["result"].get("results", []):
        package_tags = {item.get("name", "").lower() for item in package.get("tags", [])}
        if tag.lower() not in package_tags:
            continue

        resources.extend(_resources_from_package(package))

    return resources


def _discover_package_resources(session: requests.Session, dataset_url: str) -> list[Resource]:
    package_name = _package_name_from_url(dataset_url)
    if not package_name:
        return []

    api_url = _api_action_url(dataset_url, "package_show")
    response = session.get(api_url, params={"id": package_name}, timeout=30)

    if response.status_code == 404:
        return []

    response.raise_for_status()
    payload = response.json()

    if not payload.get("success"):
        return []

    return _resources_from_package(payload["result"])


def _extract_resource_ids(session: requests.Session, dataset_url: str) -> list[str]:
    response = session.get(dataset_url, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    ids: list[str] = []

    for item in soup.select("[data-id]"):
        resource_id = item.get("data-id", "").strip()
        if resource_id and resource_id not in ids:
            ids.append(resource_id)

    return ids


def _fetch_ckan_resource(
    session: requests.Session,
    dataset_url: str,
    resource_id: str,
) -> Resource | None:
    api_url = _api_action_url(dataset_url, "resource_show")
    response = session.get(api_url, params={"id": resource_id}, timeout=30)

    if response.status_code == 404:
        return None

    response.raise_for_status()
    payload = response.json()

    if not payload.get("success"):
        return None

    result = payload["result"]
    return Resource(
        id=str(result.get("id") or resource_id),
        name=str(result.get("name") or result.get("description") or resource_id),
        format=str(result.get("format") or _guess_format(result.get("url", ""))).upper(),
        url=str(result["url"]),
        package_name=str(result.get("package_id") or ""),
        mimetype=str(result.get("mimetype") or ""),
    )


def _discover_direct_links(
    session: requests.Session,
    dataset_url: str,
    selected_ids: set[str],
) -> list[Resource]:
    response = session.get(dataset_url, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    resources: list[Resource] = []

    for index, link in enumerate(soup.select("a[href]"), start=1):
        href = urljoin(dataset_url, link["href"])
        file_format = _guess_format(href)
        if file_format not in {"CSV", "XLS", "XLSX"}:
            continue

        resource_id = link.get("data-id") or f"direct-{index}"
        if selected_ids and resource_id not in selected_ids:
            continue

        name = link.get_text(" ", strip=True) or href.rsplit("/", 1)[-1]
        resources.append(Resource(id=resource_id, name=name, format=file_format, url=href))

    return _filter_supported(resources)


def _filter_supported(resources: list[Resource]) -> list[Resource]:
    return [
        resource
        for resource in resources
        if _resource_format(resource) in {"CSV", "XLS", "XLSX", "ZIP"}
    ]


def _filter_selected(resources: list[Resource], selected_ids: set[str]) -> list[Resource]:
    if not selected_ids:
        return resources

    return [resource for resource in resources if resource.id in selected_ids]


def _dedupe(resources: list[Resource]) -> list[Resource]:
    seen: set[str] = set()
    unique_resources: list[Resource] = []

    for resource in resources:
        key = resource.id or resource.url
        if key in seen:
            continue
        seen.add(key)
        unique_resources.append(resource)

    return unique_resources


def _resources_from_package(package: dict) -> list[Resource]:
    package_name = str(package.get("name") or package.get("id") or "")
    package_title = str(package.get("title") or package_name)
    resources: list[Resource] = []

    for item in package.get("resources", []):
        url = str(item.get("url") or "")
        if not url:
            continue

        resources.append(
            Resource(
                id=str(item.get("id") or url),
                name=str(item.get("name") or item.get("description") or url.rsplit("/", 1)[-1]),
                format=str(item.get("format") or _guess_format(url)).upper(),
                url=url,
                package_name=package_name,
                package_title=package_title,
                mimetype=str(item.get("mimetype") or ""),
            )
        )

    return resources


def _resource_format(resource: Resource) -> str:
    guessed = _guess_format(resource.url)
    if guessed == "ZIP":
        return "ZIP"

    return (resource.format or guessed).upper()


def _api_action_url(dataset_url: str, action: str) -> str:
    parsed = urlparse(dataset_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    return urljoin(base, f"/api/3/action/{action}")


def _package_name_from_url(dataset_url: str) -> str:
    path_parts = [part for part in urlparse(dataset_url).path.split("/") if part]
    if "dataset" not in path_parts:
        return ""

    dataset_index = path_parts.index("dataset")
    if len(path_parts) <= dataset_index + 1:
        return ""

    return path_parts[dataset_index + 1]


def _guess_format(url: str) -> str:
    path = urlparse(url).path.lower()
    if path.endswith(".xlsx"):
        return "XLSX"
    if path.endswith(".xls"):
        return "XLS"
    if path.endswith(".csv"):
        return "CSV"
    if path.endswith(".zip"):
        return "ZIP"
    return ""
