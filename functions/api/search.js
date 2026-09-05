export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const q = (url.searchParams.get("q") || "").trim();

    if (!q) {
        return json({
            success: false,
            error: "กรุณาระบุคำค้น"
        }, 400);
    }

    try {
        /*
         * ค้นหา 2 แบบพร้อมกัน
         * ลดเวลารอจากเดิมที่ค้นหาหลายรอบแบบต่อกัน
         */
        const queries = [
            `${q} karaoke`,
            `${q} คาราโอเกะ`
        ];

        const responses = await Promise.all(
            queries.map(searchYouTube)
        );

        const allResults = responses.flat();

        /*
         * Deduplicate
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
             * ----------------------------------------
             * HARD BLOCK
             * ----------------------------------------
             *
             * ตัดเพลงจริง / MV จริง / Live / Concert
             * ออกจากระบบ Karaoke
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
                /ต้นฉบับ/i,
                /official/i
            ];

            /*
             * ถ้าเป็นเพลงจริงจากชื่อ/ช่อง
             * ให้ตัดออก
             */
            if (blockedPatterns.some(pattern => pattern.test(text))) {
                continue;
            }

            /*
             * ----------------------------------------
             * Karaoke classification
             * ----------------------------------------
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

            /*
             * ต้องเป็น Karaoke เท่านั้น
             */
            if (!isNormalKaraoke && !isKaraokeMidi && !isMidiOnly) {
                continue;
            }

            /*
             * ----------------------------------------
             * Detect Karaoke + MV / Video style
             * ----------------------------------------
             *
             * ต้องการ Karaoke ที่มีภาพ/วิดีโอประกอบ
             * ให้ขึ้นก่อน MIDI
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
             * ----------------------------------------
             * Score
             * ----------------------------------------
             *
             * IMPORTANT:
             * Karaoke / Karaoke MV / MIDI แยกคะแนนกัน
             * ไม่ให้ MIDI แซง Karaoke
             */

            let score = 0;

            /*
             * 1. NORMAL KARAOKE
             */
            if (isNormalKaraoke) {
                score += 1000;
            }

            /*
             * 2. Karaoke ที่มี MV / Video
             *
             * ให้คะแนนเพิ่มมากที่สุด
             */
            if (isNormalKaraoke && hasMV) {
                score += 700;
            }

            if (isNormalKaraoke && hasVideoKeyword) {
                score += 500;
            }

            /*
             * 3. Karaoke ในชื่อโดยตรง
             */
            if (/\bkaraoke\b/i.test(title)) {
                score += 250;
            }

            if (/คาราโอเกะ/i.test(title)) {
                score += 250;
            }

            /*
             * 4. Karaoke MIDI
             *
             * ต่ำกว่า Normal Karaoke ชัดเจน
             */
            if (isKaraokeMidi) {
                score = 500;
            }

            /*
             * 5. MIDI อย่างเดียว
             */
            if (isMidiOnly) {
                score = 300;
            }

            /*
             * 6. ลด MIDI เพิ่มอีก
             * ถ้ามีคำ MIDI อยู่ในชื่อ
             */
            if (/\bmidi\b/i.test(title)) {
                score -= 50;
            }

            /*
             * 7. ถ้า Karaoke MV
             * ให้ดันขึ้นอีก
             */
            if (
                isNormalKaraoke &&
                (
                    hasMV ||
                    hasVideoKeyword
                )
            ) {
                score += 200;
            }

            /*
             * 8. ชื่อเพลงตรงกับคำค้น
             */
            const searchWords = q
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);

            let matchedWords = 0;

            for (const word of searchWords) {
                if (word.length >= 2 && title.includes(word)) {
                    matchedWords++;
                }
            }

            score += matchedWords * 50;

            /*
             * เก็บคะแนนไว้สำหรับ sort
             */
            results.push({
                ...item,
                _score: score
            });
        }

        /*
         * ----------------------------------------
         * Sort
         * ----------------------------------------
         *
         * 1. Karaoke MV / Video
         * 2. Karaoke
         * 3. Karaoke MIDI
         * 4. MIDI
         */
        results.sort((a, b) => {
            if (b._score !== a._score) {
                return b._score - a._score;
            }

            /*
             * ถ้าคะแนนเท่ากัน
             * ใช้ title เป็นตัวช่วยให้ผลนิ่ง
             */
            return a.title.localeCompare(
                b.title,
                "th"
            );
        });

        /*
         * เอาเฉพาะข้อมูลที่ frontend ต้องใช้
         */
        const cleanResults = results
            .slice(0, 20)
            .map(item => ({
                videoId: item.videoId,
                title: item.title,
                channel: item.channel,
                duration: item.duration,
                thumbnail: item.thumbnail
            }));

        return json({
            success: true,
            query: q,
            count: cleanResults.length,
            results: cleanResults
        });

    } catch (error) {
        console.error("YouTube search error:", error);

        return json({
            success: false,
            error: "ค้นหา YouTube ไม่สำเร็จ"
        }, 500);
    }
}


/*
 * =====================================================
 * YouTube Search
 * =====================================================
 */

async function searchYouTube(query) {
    const url =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query);

    const response = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 " +
                "(KHTML, like Gecko) " +
                "Chrome/131.0 Safari/537.36",

            "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
        }
    });

    if (!response.ok) {
        throw new Error(
            `YouTube HTTP ${response.status}`
        );
    }

    const html = await response.text();

    /*
     * หา ytInitialData
     */
    const match = html.match(
        /var ytInitialData = ({.*?});<\/script>/
    );

    if (!match) {
        return [];
    }

    let data;

    try {
        data = JSON.parse(match[1]);
    } catch (error) {
        console.error(
            "ytInitialData parse error:",
            error
        );

        return [];
    }

    const results = [];

    walk(data, node => {
        if (!node || typeof node !== "object") {
            return;
        }

        /*
         * YouTube search video renderer
         */
        if (node.videoRenderer) {
            const video = node.videoRenderer;

            const videoId = video.videoId;

            if (!videoId) {
                return;
            }

            const title =
                getRunsText(
                    video.title
                );

            const channel =
                getRunsText(
                    video.ownerText ||
                    video.longBylineText
                );

            const duration =
                video.lengthText?.simpleText ||
                getRunsText(
                    video.lengthText
                ) ||
                "";

            const thumbnail =
                video.thumbnail?.thumbnails?.[
                    video.thumbnail.thumbnails.length - 1
                ]?.url ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            if (!title) {
                return;
            }

            results.push({
                videoId,
                title,
                channel,
                duration,
                thumbnail
            });
        }
    });

    return results;
}


/*
 * =====================================================
 * Recursive walker
 * =====================================================
 */

function walk(value, callback) {
    if (!value || typeof value !== "object") {
        return;
    }

    callback(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            walk(item, callback);
        }

        return;
    }

    for (const key of Object.keys(value)) {
        walk(value[key], callback);
    }
}


/*
 * =====================================================
 * YouTube text helper
 * =====================================================
 */

function getRunsText(obj) {
    if (!obj) {
        return "";
    }

    if (typeof obj.simpleText === "string") {
        return obj.simpleText;
    }

    if (Array.isArray(obj.runs)) {
        return obj.runs
            .map(run => run?.text || "")
            .join("");
    }

    return "";
}


/*
 * =====================================================
 * Normalize
 * =====================================================
 */

function normalize(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}


/*
 * =====================================================
 * JSON response
 * =====================================================
 */

function json(data, status = 200) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "public, max-age=30"
            }
        }
    );
}
