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
        // ค้นหาคำค้นหา + คาราโอเกะ ตามสูตร Python
        const searchQuery = `${q} คาราโอเกะ`;
        const rawResults = await searchYouTube(searchQuery);

        // Deduplicate ตาม videoId พร้อมคงลำดับดั้งเดิม (originalIndex)
        const unique = new Map();
        rawResults.forEach((item, index) => {
            if (!item.videoId) return;
            if (!unique.has(item.videoId)) {
                unique.set(item.videoId, { ...item, originalIndex: index });
            }
        });

        // กำหนดชุดคีย์เวิร์ดตามสคริปต์ Python
        const MV_KEYWORDS = [
            "OFFICIAL MV", "OFFICIAL MUSIC VIDEO", "MUSIC VIDEO",
            "[MV]", "(MV)", " TEASER ", "REACTION"
        ];

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

            // กรอง MV ออก ยกเว้นคลิปนั้นจะระบุชัดเจนว่าเป็น Karaoke
            const isKaraoke = titleUpper.includes("KARAOKE") || title.includes("คาราโอเกะ");
            const isPureMV = MV_KEYWORDS.some(kw => titleUpper.includes(kw)) && !isKaraoke;
            if (isPureMV) {
                continue;
            }

            let score = 0;

            // 1. คะแนนความตรงของชื่อเพลง (ตัวตัดสินหลัก)
            score += calculateTitleRelevance(title, q);

            // 2. คะแนนอันดับความนิยมดั้งเดิมจาก YouTube
            score += Math.max(0, 25 - entry.originalIndex);

            // 3. คะแนนช่อง Official GMM & RS
            if (GMM_RS_CHANNELS.some(ch => channelUpper.includes(ch))) {
                score += 15;
            } else if (["GMM", "GRAMMY", "GENIE", "RS", "อาร์สยาม"].some(kw => titleUpper.includes(kw))) {
                score += 10;
            }

            // 4. คะแนนมาสเตอร์ดนตรีแท้ / คาราโอเกะ
            if (MASTER_KEYWORDS.some(pref => titleUpper.includes(pref))) {
                score += 8;
            }

            // 5. คะแนนภาพชัด 1080p
            if (["1080P", "1080", "FHD", "4K", "HD"].some(hd => titleUpper.includes(hd))) {
                score += 4;
            }

            // 6. หักคะแนนไฟล์เสียงสังเคราะห์ MIDI
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

        // จัดอันดับตามคะแนนความแม่นยำสูงสุด
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
 * Title Relevance Algorithm (แปลงจาก Python)
 * =====================================================
 */
function calculateTitleRelevance(title, query) {
    const q = query.trim().toLowerCase();
    const t = title.toLowerCase();

    // ลบแท็กในวงเล็บและคำว่าคาราโอเกะออก เพื่อดึงชื่อเพลงเพียวๆ
    let cleanT = t.replace(/\[.*?\]|\(.*?\)|【.*?】/g, "");
    cleanT = cleanT.replace(/คาราโอเกะ/g, "").replace(/karaoke/g, "").trim();

    // แยกส่วนด้วยเครื่องหมายขีด (เช่น "ขอบฟ้า - BODYSLAM")
    const parts = cleanT.split("-").map(p => p.trim()).filter(Boolean);

    // 1. ชื่อเพลงตรงกับคำค้นหาแบบเป๊ะๆ 100%
    for (const p of parts) {
        if (p === q) return 50;
        if (p.startsWith(q + " ") || p.endsWith(" " + q)) return 35;
    }

    // 2. คำค้นหาปรากฏเป็นคำเดี่ยวๆ มีขอบเขตชัดเจน
    const escapedQ = escapeRegExp(q);
    const boundaryPattern = new RegExp(`(?:^|[\\s\\-\\(\\[\\{\\"\\'|/])${escapedQ}(?:$|[\\s\\-\\)\\]\\}\\"\\'|/])`, "i");
    if (boundaryPattern.test(t)) {
        return 30;
    }

    // 3. ปรากฏเป็นแค่ส่วนหนึ่งของคำอื่น
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
 * YouTube Innertube Fetcher (Zero Cold Start / No 429)
 * =====================================================
 */
async function searchYouTube(query) {
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
                    const v = node.videoRenderer;
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
        console.warn("Innertube fallback:", e);
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
