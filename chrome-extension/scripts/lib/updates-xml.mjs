export function renderUpdatesXml({ extensionId, version, downloadUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${extensionId}">
    <updatecheck codebase="${downloadUrl}" version="${version}" />
  </app>
</gupdate>
`;
}

export function resolveDownloadUrl(template, version) {
  if (!template.includes('{version}')) {
    throw new Error(
      `BBE_CRX_DOWNLOAD_URL_TEMPLATE must contain '{version}' placeholder. Got: ${template}`,
    );
  }
  return template.replaceAll('{version}', version);
}
