export const config = {
    runtime: 'edge'
};

/*
 * รองรับทั้ง Cloudflare Pages และ Vercel Edge Runtime
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
        // ค้นหาทั้งคำไทยและสากลควบคู่กันเพื่อผลลัพธ์ที่ครอบคลุม
        const queries = [
            `${q} คาราโอเกะ`,
            `${q} karaoke`
        ];

        const settledResponses = await Promise.allSettled(
            queries.map(query => searchYouTube(query))
        );

        const rawResults = settledResponses
            .filter(res => res.status === 'fulfilled')
            .flatMap(res => res.value);

        // Deduplicate ตาม videoId พร้อมเก็บบันทึกลำดับดั้งเดิม
        const unique = new Map();
        rawResults.forEach((item, index) => {
            if (!item.videoId) return;
            if (!unique.has(item.videoId)) {
                unique.set(item.videoId, { ...item, originalIndex: index });
            }
        });

        // คีย์เวิร์ดคัดกรอง MV
        const MV_KEYWORDS = [
            "OFFICIAL MV", "OFFICIAL MUSIC VIDEO", "MUSIC VIDEO",
            "[MV]", "(MV)", " TEASER ", "REACTION"
        ];

        // ปลดล็อก Sing King ให้ค้นหาและเล่นสตรีมตรงผ่าน Render ได้ตามปกติ
        const BLOCKED_EMBED_KEYWORDS = [];

        const GMM_RS_CHANNELS = [
            "GMM", "GRAMMY", "GENIE", "GENIEROCK", "WHITE MUSIC",
            "GRAND MUSIK", "UP G", "RS", "RSFRIENDS", "RSIAM", "อาร์สยาม"
        ];

        const MASTER_KEYWORDS = [
            "ดนตรีแท้", "ดนตรีต้นฉบับ", "OFFICIAL KARAOKE", "KARAOKE VERSION",
            "ORIGINAL KARAOKE", "INSTRUMENTAL", "BACKING TRACK"
        ];

        const MIDI_KEYWORDS = ["MIDI", "MID", "SOUNDFONT", "อิเล็กโทน", "คีย์บอร์ด"];

        const results = [];

        for (const entry of unique.values()) {
            const title = entry.title || "ไม่ทราบชื่อเพลง";
            const titleUpper = ` ${title.toUpperCase()} `;
            const channel = entry.channel || "";
            const channelUpper = channel.toUpperCase();

            // ตรวจสอบคีย์เวิร์ดบล็อก
            const isBlockedEmbed = BLOCKED_EMBED_KEYWORDS.some(kw => 
                channelUpper.includes(kw) || titleUpper.includes(kw)
            );
            if (isBlockedEmbed) {
                continue;
            }

            // 1. กรอง MV ออก ยกเว้นคลิปนั้นจะระบุชัดว่าเป็น Karaoke
            const isKaraoke = titleUpper.includes("KARAOKE") || title.includes("คาราโอเกะ");
            const isPureMV = MV_KEYWORDS.some(kw => titleUpper.includes(kw)) && !isKaraoke;
            if (isPureMV) {
                continue;
            }

            let score = 0;

            // 2. คะแนนความตรงของชื่อเพลง
            score += calculateTitleRelevance(title, q);

            // 3. คะแนนอันดับความนิยมดั้งเดิมจาก YouTube
            score += Math.max(0, 25 - entry.originalIndex);

            // 4. คะแนนช่อง Official GMM & RS
            if (GMM_RS_CHANNELS.some(ch => channelUpper.includes(ch))) {
                score += 15;
            } else if (["GMM", "GRAMMY", "GENIE", "RS", "อาร์สยาม"].some(kw => titleUpper.includes(kw))) {
                score += 10;
            }

            // 5. คะแนนมาสเตอร์ดนตรีแท้ / คาราโอเกะ
            if (MASTER_KEYWORDS.some(pref => titleUpper.includes(pref))) {
                score += 8;
            }

            // 6. คะแนนภาพชัด
            if (["1080P", "1080", "FHD", "4K", "HD"].some(hd => titleUpper.includes(hd))) {
                score += 4;
            }

            // 7. หักคะแนนไฟล์สังเคราะห์ MIDI
            if (MIDI_KEYWORDS.some(midi => titleUpper.includes(midi))) {
                score -= 15;
            }

            results.push({
                id: entry.videoId,
                videoId: entry.videoId,
                title: title,
                thumbnail: entry.thumbnail,
                thumb: entry.thumbnail,
                channel: channel || "YouTube",
                author: channel || "YouTube",
                duration: entry.duration || "",
                timestamp: entry.duration || "",
                score: score
            });
        }

        // เรียงลำดับตามคะแนนความแม่นยำสูงสุด
        results.sort((a, b) => b.score - a.score);

        const cleanResults = results.slice(0, 20);

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
        console.error("Search Error:", error);
        return json({
            success: false,
            error: "ค้นหาเพลงไม่สำเร็จ",
            results: [],
            items: []
        }, 200);
    }
}

/*
 * =====================================================
 * Title Relevance Algorithm
 * =====================================================
 */
function calculateTitleRelevance(title, query) {
    if (!title || !query) return 0;
    const q = query.trim().toLowerCase();
    const t = title.toLowerCase();

    // ลบแท็กในวงเล็บและคำว่าคาราโอเกะออก เพื่อดึงชื่อเพลงเพียวๆ
    let cleanT = t.replace(/\[.*?\]|\(.*?\)|【.*?】/g, "");
    cleanT = cleanT.replace(/คาราโอเกะ/g, "").replace(/karaoke/g, "").trim();

    // แยกส่วนด้วยเครื่องหมายขีด (เช่น "เราและนาย - LOSO")
    const parts = cleanT.split("-").map(p => p.trim()).filter(Boolean);

    // 1. ชื่อเพลงตรงกับคำค้นหาแบบเป๊ะๆ 100%
    for (const p of parts) {
        if (p === q) return 50;
        if (p.startsWith(q + " ") || p.endsWith(" " + q)) return 35;
    }

    // 2. คำค้นหาปรากฏเป็นคำเดี่ยวๆ มีขอบเขตชัดเจน
    try {
        const escapedQ = escapeRegExp(q);
        const boundaryPattern = new RegExp(`(?:^|[\\s\\-\\(\\[\\{\\"\\'|/])${escapedQ}(?:$|[\\s\\-\\)\\]\\}\\"\\'|/])`, "i");
        if (boundaryPattern.test(t)) {
            return 30;
        }
    } catch (e) {}

    // 3. ปรากฏเป็นส่วนหนึ่งของชื่อเพลง
    if (t.includes(q)) {
        return 10;
    }

    return 0;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * =====================================================
 * YouTube Search (Innertube + Fallback สองชั้น)
 * =====================================================
 */
async function searchYouTube(query) {
    // 1. ดึงผ่าน Innertube API
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
                if (node && (node.videoRenderer || node.compactVideoRenderer)) {
                    const v = node.videoRenderer || node.compactVideoRenderer;
                    if (!v.videoId) return;

                    const title = getRunsText(v.title) || v.headline?.simpleText || "";
                    const channel = getRunsText(v.ownerText || v.shortBylineText || v.longBylineText);
                    const duration = v.lengthText?.simpleText || getRunsText(v.lengthText) || "";
                    const thumbnail = `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

                    if (title) {
                        results.push({ videoId: v.videoId, title, channel, duration, thumbnail });
                    }
                }
            });
            if (results.length > 0) return results;
        }
    } catch (e) {
        console.warn("Innertube search fallback:", e);
    }

    // 2. สำรองด้วยการดึงหน้า HTML
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
                    if (node && (node.videoRenderer || node.compactVideoRenderer)) {
                        const v = node.videoRenderer || node.compactVideoRenderer;
                        if (!v.videoId) return;

                        const title = getRunsText(v.title);
                        const channel = getRunsText(v.ownerText || v.shortBylineText || v.longBylineText);
                        const duration = v.lengthText?.simpleText || getRunsText(v.lengthText) || "";
                        const thumbnail = `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

                        if (title) {
                            results.push({ videoId: v.videoId, title, channel, duration, thumbnail });
                        }
                    }
                });
                if (results.length > 0) return results;
            }
        }
    } catch (e) {
        console.error("HTML search error:", e);
    }

    return [];
}

/*
 * =====================================================
 * Helpers
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
