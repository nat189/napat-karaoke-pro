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

  if (!rawQuery || !rawQuery.trim()) {
    return new Response(JSON.stringify([]), { status: 200, headers });
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

    // ดึง ytInitialData แบบปลอดภัย ไม่ใช้ Regex ตัดตอน เพื่อป้องกัน JSON.parse พัง
    let data = null;
    const markers = ['var ytInitialData = ', 'ytInitialData = ', 'window["ytInitialData"] = '];
    for (const marker of markers) {
      const idx = html.indexOf(marker);
      if (idx !== -1) {
        const endIdx = html.indexOf('</script>', idx);
        if (endIdx !== -1) {
          let raw = html.slice(idx + marker.length, endIdx).trim();
          if (raw.endsWith(';')) raw = raw.slice(0, -1).trim();
          try {
            data = JSON.parse(raw);
            break;
          } catch (e) {}
        }
      }
    }

    if (!data) {
      return new Response(JSON.stringify([]), { status: 200, headers });
    }

    // วนหา itemSectionRenderer ทุก section (แก้ปัญหาคำสั้นๆ ที่ YouTube แทรกโฆษณา/แท็กมาบังช่องแรก)
    const sections =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    let contents = [];
    for (const sec of sections) {
      if (sec.itemSectionRenderer?.contents) {
        contents = sec.itemSectionRenderer.contents;
        break;
      }
    }

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

    // ส่งกลับเป็น Array [...] ตรงๆ ตามที่ controller.html ต้องการ
    return new Response(JSON.stringify(finalResults), {
      status: 200,
      headers,
    });
  } catch (err) {
    // หากเกิด Error ให้ส่ง Array ว่าง [] เสมอ เพื่อป้องกันไม่ให้หน้ารีโมตแจ้งเตือน "รูปแบบข้อมูลไม่ถูกต้อง"
    return new Response(JSON.stringify([]), {
      status: 200,
      headers,
    });
  }
}
