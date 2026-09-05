export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const q = url.searchParams.get("q");

    if (!q) {
        return Response.json(
            {
                error: "Missing search query"
            },
            {
                status: 400
            }
        );
    }

    return Response.json({
        success: true,
        query: q,
        results: []
    });
}
