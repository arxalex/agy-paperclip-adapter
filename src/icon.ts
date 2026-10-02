export const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 19h20L12 2z" stroke="#4285F4" stroke-width="2"/><ellipse cx="12" cy="14" rx="8" ry="3" stroke="#A142F4" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="12" cy="10" r="2" fill="#4285F4"/></svg>`;

export const iconSvg = rawSvg;
export const iconDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`;
export const iconBase64 = `data:image/svg+xml;base64,${Buffer.from(rawSvg).toString("base64")}`;

export const icon = iconDataUrl;
export const iconUrl = iconDataUrl;
