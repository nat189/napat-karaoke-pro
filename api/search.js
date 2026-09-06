export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=300",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (!q) {
    return new Response(
      JSON.stringify({ items: [], results: [], songs: [] }),
      { status: 200, headers }
    );
  }

  try {
    const searchQuery = `${q.trim()} คาราโอเกะ`;
    const YT_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

    const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${YT_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.26.35 (Linux; U; Android 11; gzip)',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.26.35',
            hl: 'th',
            gl: 'TH',
          }
        },
        query: searchQuery
      })
    });

    if (!res.ok) {
      throw new Error(`YouTube API returned ${res.status}`);
    }

    const data = await res.json();
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ||
      data?.contents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer
        ?.contents ||
      [];

    const results = [];
    for (const item of contents) {
      const v = item.videoRenderer || item.compactVideoRenderer;
      if (v && v.videoId) {
        const titleText =
          v.title?.runs?.[0]?.text || v.title?.simpleText || "";
        const authorText =
          v.ownerText?.runs?.[0]?.text ||
          v.shortBylineText?.runs?.[0]?.text ||
          "";
        const timeText = v.lengthText?.simpleText || "";
        const thumb = `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

        results.push({
          videoId: v.videoId,
          id: v.videoId,
          title: titleText,
          thumbnail: thumb,
          thumb: thumb,
          author: authorText,
          channel: authorText,
          timestamp: timeText,
          duration: timeText,
        });
      }
    }

    const finalData = results.slice(0, 20);

    return new Response(
      JSON.stringify({
        items: finalData,
        results: finalData,
        songs: finalData,
        data: finalData,
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (err) {
    // ป้องกันหน้าเว็บขึ้น Error 500
    return new Response(
      JSON.stringify({
        items: [],
        results: [],
        songs: [],
        error: err.message,
      }),
      {
        status: 200,
        headers,
      }
    );
  }
}
