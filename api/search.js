export const config = {
    runtime: 'edge'
};

/*
 * รองรับทั้ง Cloudflare Pages และ Vercel
 */
export async function onRequestGet(context) {
    return handleRequest(context.request);
}

export async function onRequest(context) {
    return handleRequest(context.request);
}

export default async function handler(request) {
    return handleRequest(request);
}

/*
 * =====================================================
 * Main Request Handler
 * =====================================================
 */
async function handleRequest(request) {
    // รองรับ CORS Preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();

    if (!q) {
        return json({
            success: false,
            error: "กรุณาระบุคำค้น",
            results: [],
            items: []
        }, 400);
    }

    try {
        /*
         * ค้นหา 2 แบบพร้อมกัน (ใช้ allSettled เพื่อไม่ให้พังหากคำใดคำหนึ่งล้มเหลว)
         */
        const queries = [
            `${q} karaoke`,
            `${q} คาราโอเกะ`
        ];

        const settledResponses = await Promise.allSettled(
            queries.map(searchYouTube)
        );

        const allResults = settledResponses
            .filter(res => res.status === 'fulfilled')
            .flatMap(res => res.value);

        /*
         * Deduplicate ตาม videoId
         */
        const unique = new Map();
        for (const item of allResults) {
            if (!item.videoId) continue;
            if (!unique.has(item.videoId)) {
                unique.set(item.videoId, item);
            }
        }

        /*
         * Filter + Score
         */
        const results = [];

        for (const item of unique.values()) {
            const title = normalize(item.title);
            const channel = normalize(item.channel);
            const text = `${title} ${channel}`;

            /*
             * HARD BLOCK: ตัดเพลงจริง / MV จริง / Live / Concert
             */
            const blockedPatterns = [
                /\bofficial\s*mv\b/i,
                /\bofficial\s*video\b/i,
                /\bofficial\s*audio\b/i,
                /\bmusic\s*video\b/i,
                /\blive\b/i,
                /\bconcert\b/i,
                /\bperformance\b/i,
                /\blyrics?\b/i,
                /\blyric\s*video\b/i,
                /\bcover\b/i,
                /\breaction\b/i,
                /\bremix\b/i,
                /\bsped\s*up\b/i,
                /\bslowed\b/i,
                /\bsubtitle\b/i,
                /\bsub\b/i,
                /เพลงเต็ม/i,
                /ต้นฉบับ/i
            ];

            // หากมีคำว่า official แต่ไม่ใช่ Official Karaoke ให้ตัดออก
            if (/\bofficial\b/i.test(title) && !/(karaoke|คาราโอเกะ)/i.test(title)) {
                continue;
            }

            if (blockedPatterns.some(pattern => pattern.test(text))) {
                continue;
            }

            /*
             * Karaoke Classification
             */
            const isKaraokeMidi =
                /\bkaraoke\s+midi\b/i.test(text) ||
                /\bmidi\s+karaoke\b/i.test(text) ||
                /คาราโอเกะ\s*midi/i.test(text) ||
                /midi\s*คาราโอเกะ/i.test(text);

            const isMidiOnly =
                !isKaraokeMidi &&
                /\bmidi\b/i.test(text);

            const isNormalKaraoke =
                !isKaraokeMidi &&
                !isMidiOnly &&
                (
                    /\bkaraoke\b/i.test(text) ||
                    /คาราโอเกะ/i.test(text)
                );

            if (!isNormalKaraoke && !isKaraokeMidi && !isMidiOnly) {
                continue;
            }

            /*
             * Detect Karaoke + MV / Video style
             */
            const hasMV =
                /\bmv\b/i.test(title) ||
                /\bvideo\b/i.test(title) ||
                /\bvisual\b/i.test(title) ||
                /\bwith\s+mv\b/i.test(title) ||
                /\bbackground\s+video\b/i.test(title) ||
                /มีmv/i.test(title) ||
                /พร้อมmv/i.test(title) ||
                /ภาพประกอบ/i.test(title);

            const hasVideoKeyword =
                /\bkaraoke\s+video\b/i.test(title) ||
                /\bvideo\s+karaoke\b/i.test(title) ||
                /คาราโอเกะ.*วีดีโอ/i.test(title) ||
                /คาราโอเกะ.*วิดีโอ/i.test(title);

            /*
             * คำนวณคะแนน (Scoring System)
             */
            let score = 0;

            if (isNormalKaraoke) score += 1000;
            if (isNormalKaraoke && hasMV) score += 700;
            if (isNormalKaraoke && hasVideoKeyword) score += 500;

            if (/\bkaraoke\b/i.test(title)) score += 250;
            if (/คาราโอเกะ/i.test(title)) score += 250;

            if (isKaraokeMidi) score = 500;
            if (isMidiOnly) score = 300;
            if (/\bmidi\b/i.test(title)) score -= 50;

            if (isNormalKaraoke && (hasMV || hasVideoKeyword)) {
                score += 200;
            }

            const searchWords = q.toLowerCase().split(/\s+/).filter(Boolean);
            let matchedWords = 0;
            for (const word of searchWords) {
                if (word.length >= 2 && title.toLowerCase().includes(word)) {
                    matchedWords++;
                }
            }
            score += matchedWords * 50;

            results.push({
                ...item,
                _score: score
            });
        }

        /*
         * จัดเรียงตามคะแนน
         */
        results.sort((a, b) => {
            if (b._score !== a._score) {
                return b._score - a._score;
            }
            return a.title.localeCompare(b.title, "th");
        });

        /*
         * คืนค่าข้อมูลที่ครอบคลุมทุกตัวแปรของ Frontend
         */
        const cleanResults = results.slice(0, 20).map(item => ({
            videoId: item.videoId,
            id: item.videoId,
            title: item.title,
            channel: item.channel,
            author: item.channel,
            duration: item.duration,
            timestamp: item.duration,
            thumbnail: item.thumbnail,
            thumb: item.thumbnail
        }));

        return json({
            success: true,
            query: q,
            count: cleanResults.length,
            results: cleanResults,
            items: cleanResults,
            songs: cleanResults,
            data: cleanResults
        });

    } catch (error) {
        console.error("YouTube search error:", error);
        return json({
            success: false,
            error: "ค้นหา YouTube ไม่สำเร็จ",
            results: [],
            items: []
        }, 200); // ส่ง 200 พร้อม Array ว่างเพื่อไม่ให้หน้ารีโมตพ่น HTTP 500
    }
}

/*
 * =====================================================
 * YouTube Search (รองรับ Internal API ป้องกัน 429 บล็อก)
 * =====================================================
 */
async function searchYouTube(query) {
    // 1. ลองผ่าน YouTube Internal API ก่อน (เสถียร ไม่โดน Datacenter IP แบน)
    try {
        const YT_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${YT_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/19.26.35 (Linux; U; Android 11; gzip)'
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'ANDROID',
                        clientVersion: '19.26.35',
                        hl: 'th',
                        gl: 'TH'
                    }
                },
                query: query
            })
        });

        if (res.ok) {
            const data = await res.json();
            const results = [];
            walk(data, node => {
                if (node && node.videoRenderer) {
                    const video = node.videoRenderer;
                    const videoId = video.videoId;
                    if (!videoId) return;

                    const title = getRunsText(video.title) || video.headline?.simpleText || "";
                    const channel = getRunsText(video.ownerText || video.shortBylineText || video.longBylineText);
                    const duration = video.lengthText?.simpleText || getRunsText(video.lengthText) || "";
                    const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                    if (title) {
                        results.push({ videoId, title, channel, duration, thumbnail });
                    }
                }
            });
            if (results.length > 0) return results;
        }
    } catch (e) {
        console.warn("Internal search fallback:", e);
    }

    // 2. Fallback: ดึงผ่านหน้าเว็บ YouTube HTML ตามโค้ดเดิม
    try {
        const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
                "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
            }
        });

        if (response.ok) {
            const html = await response.text();
            const match = html.match(/var ytInitialData = ({.*?});<\/script>/) ||
                          html.match(/ytInitialData\s*=\s*({.+?});/);

            if (match) {
                const data = JSON.parse(match[1]);
                const results = [];
                walk(data, node => {
                    if (node && node.videoRenderer) {
                        const video = node.videoRenderer;
                        const videoId = video.videoId;
                        if (!videoId) return;

                        const title = getRunsText(video.title);
                        const channel = getRunsText(video.ownerText || video.longBylineText);
                        const duration = video.lengthText?.simpleText || getRunsText(video.lengthText) || "";
                        const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url ||
                                          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                        if (title) {
                            results.push({ videoId, title, channel, duration, thumbnail });
                        }
                    }
                });
                return results;
            }
        }
    } catch (e) {
        console.error("HTML scrape error:", e);
    }

    return [];
}

/*
 * =====================================================
 * Helper Functions
 * =====================================================
 */
function walk(value, callback) {
    if (!value || typeof value !== "object") return;
    callback(value);
    if (Array.isArray(value)) {
        for (const item of value) walk(item, callback);
        return;
    }
    for (const key of Object.keys(value)) {
        walk(value[key], callback);
    }
}

function getRunsText(obj) {
    if (!obj) return "";
    if (typeof obj.simpleText === "string") return obj.simpleText;
    if (Array.isArray(obj.runs)) {
        return obj.runs.map(run => run?.text || "").join("");
    }
    return "";
}

function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function json(data, status = 200) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Cache-Control": "public, max-age=60"
            }
        }
    );
}
