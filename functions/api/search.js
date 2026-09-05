export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const q = (url.searchParams.get("q") || "").trim();

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
        /*
         * ============================================================
         * SEARCH STRATEGY
         * ============================================================
         *
         * ค้นหลายรูปแบบเพื่อเพิ่มโอกาสเจอ Karaoke / Karaoke MIDI
         *
         * 1. ชื่อเพลง + karaoke
         * 2. ชื่อเพลง + คาราโอเกะ
         * 3. ชื่อเพลง + karaoke midi
         * 4. ชื่อเพลง + midi karaoke
         *
         * จากนั้นรวมผล + กรอง + จัดอันดับ
         */

        const searchQueries = [
            `${q} karaoke`,
            `${q} คาราโอเกะ`,
            `${q} karaoke midi`,
            `${q} midi karaoke`
        ];

        const allResults = [];

        for (const searchQuery of searchQueries) {
            try {
                const youtubeUrl =
                    "https://www.youtube.com/results?search_query=" +
                    encodeURIComponent(searchQuery);

                const response = await fetch(youtubeUrl, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
                        "Accept-Language":
                            "th-TH,th;q=0.9,en;q=0.8"
                    }
                });

                if (!response.ok) {
                    continue;
                }

                const html = await response.text();

                const marker = "var ytInitialData = ";
                const start = html.indexOf(marker);

                if (start === -1) {
                    continue;
                }

                const jsonStart = start + marker.length;
                const jsonEnd = html.indexOf(";</script>", jsonStart);

                if (jsonEnd === -1) {
                    continue;
                }

                const data = JSON.parse(
                    html.substring(jsonStart, jsonEnd)
                );

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

                        allResults.push({
                            videoId: video.videoId,
                            title,
                            channel,
                            thumbnail,
                            duration,
                            url:
                                `https://www.youtube.com/watch?v=${video.videoId}`
                        });
                    }
                }
            } catch (error) {
                console.error(
                    "YouTube search error:",
                    searchQuery,
                    error
                );
            }
        }

        /*
         * ============================================================
         * FILTER
         * ============================================================
         *
         * สิ่งที่ไม่ต้องการ:
         * - MV
         * - Official Music Video
         * - Music Video
         * - Live
         * - Concert
         * - Performance
         * - Official Audio
         * - Lyrics / เนื้อเพลง
         * - Cover
         * - Reaction
         * - Subtitle / ซับ
         */

        const blockedPatterns = [
            /\bmv\b/i,
            /official\s*mv/i,
            /official\s+music\s+video/i,
            /music\s+video/i,
            /\blive\b/i,
            /concert/i,
            /performance/i,
            /official\s+audio/i,
            /\baudio\b/i,
            /\blyrics?\b/i,
            /เนื้อเพลง/i,
            /เนื้อร้อง/i,
            /ร้องเพลง/i,
            /\bcover\b/i,
            /reaction/i,
            /รีแอค/i,
            /subtitle/i,
            /\bsub\b/i,
            /ซับ/i,
            /ซับไตเติ้ล/i,
            /ซับไตเติล/i
        ];

        /*
         * ============================================================
         * POSITIVE KEYWORDS
         * ============================================================
         *
         * เพลงที่ต้องการ:
         * - Karaoke
         * - คาราโอเกะ
         * - Karaoke MIDI
         * - MIDI Karaoke
         * - MIDI
         * - ดนตรี
         * - ร้องตาม
         * - Backing Track
         */

        const karaokePatterns = [
            /\bkaraoke\b/i,
            /คาราโอเกะ/i,
            /\bmidi\b/i,
            /ดนตรี/i,
            /ร้องตาม/i,
            /backing\s*track/i,
            /instrumental/i,
            /minus\s*one/i,
            /ไม่มีเสียงร้อง/i,
            /ไม่มีนักร้อง/i
        ];

        const midiPatterns = [
            /\bkareoke\s+midi\b/i,
            /\bk karaoke\s+midi\b/i,
            /\bk-?karaoke\s+midi\b/i,
            /\bmidi\s+karaoke\b/i,
            /\bmidi\b/i
        ];

        function hasBlockedWord(text) {
            return blockedPatterns.some(pattern =>
                pattern.test(text)
            );
        }

        function countMatches(text, patterns) {
            return patterns.reduce(
                (count, pattern) =>
                    count + (pattern.test(text) ? 1 : 0),
                0
            );
        }

        function calculateScore(item) {
            const text =
                `${item.title} ${item.channel}`.toLowerCase();

            let score = 0;

            /*
             * Karaoke เป็นเป้าหมายหลัก
             */
            if (/\bk karaoke\b/i.test(text)) score += 100;
            if (/\bk-karaoke\b/i.test(text)) score += 100;

            if (/\bk karaoke\b/i.test(text)) score += 80;

            if (/\bk karaoke midi\b/i.test(text)) score += 100;

            if (/\bk karaoke\b/i.test(text)) score += 50;

            if (/\bk karaoke\b/i.test(text)) score += 30;

            if (/\bk karaoke\b/i.test(text)) score += 20;

            if (/\bk karaoke\b/i.test(text)) score += 10;

            if (/\bk karaoke\b/i.test(text)) score += 5;

            /*
             * คำทั่วไปที่ต้องการ
             */
            if (/\bk karaoke\b/i.test(text)) score += 5;

            if (/\bk karaoke midi\b/i.test(text)) score += 50;

            if (/\bmidi\s+karaoke\b/i.test(text)) score += 50;

            if (/\bk karaoke\b/i.test(text)) score += 10;

            if (/\bk karaoke\b/i.test(text)) score += 5;

            if (/คาราโอเกะ/i.test(text)) score += 80;

            if (/\bk karaoke\b/i.test(text)) score += 80;

            if (/\bmidi\b/i.test(text)) score += 45;

            if (/backing\s*track/i.test(text)) score += 35;

            if (/instrumental/i.test(text)) score += 30;

            if (/ร้องตาม/i.test(text)) score += 25;

            if (/ไม่มีเสียงร้อง/i.test(text)) score += 30;

            /*
             * ถ้ามีคำว่า Karaoke ในชื่อเพลงโดยตรง
             */
            if (/\bk karaoke\b/i.test(item.title)) {
                score += 50;
            }

            if (/\bk karaoke\b/i.test(item.channel)) {
                score += 20;
            }

            /*
             * ลดคะแนนถ้าชื่อดูไม่ตรงกับ Karaoke
             */
            if (!karaokePatterns.some(pattern => pattern.test(text))) {
                score -= 100;
            }

            return score;
        }

        /*
         * ============================================================
         * REMOVE DUPLICATES
         * ============================================================
         */

        const unique = new Map();

        for (const item of allResults) {
            if (!unique.has(item.videoId)) {
                unique.set(item.videoId, item);
            }
        }

        /*
         * ============================================================
         * FILTER + SCORE
         * ============================================================
         */

        const filtered = [];

        for (const item of unique.values()) {
            const text =
                `${item.title} ${item.channel}`;

            /*
             * ตัดสิ่งที่ไม่ต้องการทันที
             */
            if (hasBlockedWord(text)) {
                continue;
            }

            /*
             * ต้องมีคำเกี่ยวกับ Karaoke/MIDI
             */
            const isKaraoke =
                karaokePatterns.some(pattern =>
                    pattern.test(text)
                );

            if (!isKaraoke) {
                continue;
            }

            /*
             * คำนวณคะแนน
             */
            item.score = calculateScore(item);

            filtered.push(item);
        }

        /*
         * ============================================================
         * SORT
         * ============================================================
         */

        filtered.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            return a.title.localeCompare(
                b.title,
                "th"
            );
        });

        /*
         * ส่งกลับสูงสุด 20 เพลง
         */
        const results = filtered
            .slice(0, 20)
            .map(item => ({
                videoId: item.videoId,
                title: item.title,
                channel: item.channel,
                thumbnail: item.thumbnail,
                duration: item.duration,
                url: item.url
            }));

        return Response.json({
            success: true,
            query: q,
            results
        });

    } catch (error) {
        console.error(error);

        return Response.json(
            {
                success: false,
                error: error.message || "Search failed"
            },
            {
                status: 500
            }
        );
    }
}
