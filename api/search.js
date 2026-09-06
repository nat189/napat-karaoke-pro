export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q");

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=300",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (!rawQuery) {
    return new Response(
      JSON.stringify({ items: [], results: [], songs: [] }),
      { status: 200, headers }
    );
  }

  try {
    let searchQuery = rawQuery.trim();
    const hasKaraokeKeyword =
      /karaoke|คาราโอเกะ|เนื้อเพลง|backing track|ตัดเสียง/i.test(searchQuery);
    if (!hasKaraokeKeyword) {
      searchQuery += " คาราโอเกะ";
    }

    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    const response = await fetch(ytUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "th,en-US;q=0.9,en;q=0.8",
      },
    });

    const html = await response.text();
    const match =
      html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
      html.match(/ytInitialData\s*=\s*({.+?});/s);

    if (!match) {
      return new Response(
        JSON.stringify({ items: [], results: [], songs: [] }),
        { status: 200, headers }
      );
    }

    const data = JSON.parse(match[1]);
    const contents =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents[0]?.itemSectionRenderer?.contents || [];

    const rawVideos = [];
    for (const item of contents) {
      const v = item.videoRenderer;
      if (v && v.videoId && v.title?.runs?.[0]?.text) {
        const thumb =
          v.thumbnail?.thumbnails?.[0]?.url ||
          `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;
        const titleText = v.title.runs[0].text;
        const authorText = v.ownerText?.runs?.[0]?.text || "";
        const timeText = v.lengthText?.simpleText || "";

        rawVideos.push({
          videoId: v.videoId,
          id: v.videoId,
          title: titleText,
          thumbnail: thumb,
          thumb: thumb,
          timestamp: timeText,
          duration: timeText,
          author: authorText,
          channel: authorText,
        });
      }
    }

    const karaokeKeywords =
      /คาราโอเกะ|karaoke|คีย์|ดนตรี|backing track|ตัดเสียง|midi|เนื้อเพลง|ไม่มีเสียงร้อง/i;

    const karaokeList = rawVideos.filter(
      (v) => karaokeKeywords.test(v.title) || karaokeKeywords.test(v.author)
    );
    const others = rawVideos.filter(
      (v) => !karaokeKeywords.test(v.title) && !karaokeKeywords.test(v.author)
    );

    const finalResults = [...karaokeList, ...others].slice(0, 20);

    // ครอบส่งกลับเป็น Object เพื่อให้ controller.html ทุกเงื่อนไขอ่านผ่าน 100%
    return new Response(
      JSON.stringify({
        items: finalResults,
        results: finalResults,
        songs: finalResults,
        data: finalResults,
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err.message || "Search failed",
        items: [],
        results: [],
      }),
      {
        status: 200,
        headers,
      }
    );
  }
}
