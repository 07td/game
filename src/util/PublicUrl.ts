export function getAssetBaseUrl(): string {
    if (process.env.NODE_ENV === "development") {
        return "";
    }

    return process.env.PUBLIC_URL || "";
}
