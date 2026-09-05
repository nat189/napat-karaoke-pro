export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const q = url.searchParams.get("q");

    if (!q) {
        return Response.json(
            {
                success: false,
                error: "Missing search query"
            },
            {
                status: 400
            }
        );
    }

    try {
        const youtubeUrl =
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(q);

        const response = await fetch(youtubeUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
                "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
            }
        });

        if (!response.ok) {
            throw new Error(
                `YouTube returned HTTP ${response.status}`
            );
        }

        const html = await response.text();

        const marker = "var ytInitialData = ";
        const start = html.indexOf(marker);

        if (start === -1) {
            throw new Error("ytInitialData not found");
        }

        const jsonStart = start + marker.length;
        const jsonEnd = html.indexOf(";</script>", jsonStart);

        if (jsonEnd === -1) {
            throw new Error("ytInitialData end not found");
        }

        const data = JSON.parse(
            html.substring(jsonStart, jsonEnd)
        );

        const results = [];

        const sections =
            data?.contents
                ?.twoColumnSearchResultsRenderer
                ?.primaryContents
                ?.sectionListRenderer
                ?.contents || [];

        for (const section of sections) {
            const items =
                section?.itemSectionRenderer?.contents || [];

            for (const item of items) {
                const video = item?.videoRenderer;

                if (!video?.videoId) {
                    continue;
                }

                const title =
                    video?.title?.runs?.[0]?.text ||
                    video?.title?.simpleText ||
                    "";

                const channel =
                    video?.ownerText?.runs?.[0]?.text ||
                    "";

                const thumbnail =
                    video?.thumbnail?.thumbnails?.at(-1)?.url ||
                    "";

                const duration =
                    video?.lengthText?.simpleText ||
                    "";

                results.push({
                    videoId: video.videoId,
                    title,
                    channel,
                    thumbnail,
                    duration,
                    url:
                        `https://www.youtube.com/watch?v=${video.videoId}`
                });

                if (results.length >= 20) {
                    break;
                }
            }

            if (results.length >= 20) {
                break;
            }
        }

        return Response.json({
            success: true,
            query: q,
            results
        });

    } catch (error) {
        return Response.json(
            {
                success: false,
                error: error.message
            },
            {
                status: 500
            }
        );
    }
}
