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

    /*
     * ============================================================
     * SEARCH
     * ============================================================
     *
     * ค้นหลายแบบเพื่อให้ได้ Karaoke มากที่สุด
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

            const marker =
                "var ytInitialData = ";

            const start =
                html.indexOf(marker);

            if (start === -1) {
                continue;
            }

            const jsonStart =
                start + marker.length;

            const jsonEnd =
                html.indexOf(
                    ";</script>",
                    jsonStart
                );

            if (jsonEnd === -1) {
                continue;
            }

            const data =
                JSON.parse(
                    html.substring(
                        jsonStart,
                        jsonEnd
                    )
                );

            const sections =
                data?.contents
                    ?.twoColumnSearchResultsRenderer
                    ?.primaryContents
                    ?.sectionListRenderer
                    ?.contents || [];

            for (const section of sections) {

                const items =
                    section
                        ?.itemSectionRenderer
                        ?.contents || [];

                for (const item of items) {

                    const video =
                        item?.videoRenderer;

                    if (!video?.videoId) {
                        continue;
                    }

                    const title =
                        video?.title
                            ?.runs?.[0]?.text ||
                        video?.title
                            ?.simpleText ||
                        "";

                    const channel =
                        video?.ownerText
                            ?.runs?.[0]?.text ||
                        "";

                    const thumbnail =
                        video?.thumbnail
                            ?.thumbnails
                            ?.at(-1)?.url ||
                        "";

                    const duration =
                        video?.lengthText
                            ?.simpleText ||
                        "";

                    allResults.push({
                        videoId:
                            video.videoId,

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
     * REMOVE DUPLICATES
     * ============================================================
     */

    const uniqueResults =
        new Map();

    for (const item of allResults) {

        if (
            !uniqueResults.has(
                item.videoId
            )
        ) {
            uniqueResults.set(
                item.videoId,
                item
            );
        }
    }

    /*
     * ============================================================
     * BLOCKED WORDS
     * ============================================================
     *
     * สิ่งที่ไม่ต้องการ
     */

    const blockedPatterns = [

        // MV
        /\bofficial\s+mv\b/i,
        /\bmusic\s+video\b/i,
        /\bofficial\s+music\s+video\b/i,
        /\bmv\b/i,

        // Live / Concert
        /\blive\b/i,
        /live\s+session/i,
        /concert/i,
        /performance/i,
        /showcase/i,

        // Original audio
        /\bofficial\s+audio\b/i,

        // Lyrics
        /\blyric\b/i,
        /\blyrics\b/i,
        /เนื้อเพลง/i,
        /เนื้อร้อง/i,

        // Cover
        /\bcover\b/i,
        /คัฟเวอร์/i,

        // Reaction
        /\breaction\b/i,
        /รีแอค/i,
        /รีแอคชั่น/i,

        // Subtitle / Sub
        /\bsubtitle\b/i,
        /\bsubtitles\b/i,
        /\bsub\b/i,
        /ซับไตเติ้ล/i,
        /ซับไตเติล/i,
        /ซับ/i
    ];

    /*
     * ============================================================
     * POSITIVE KEYWORDS
     * ============================================================
     */

    const karaokePatterns = {

        // Karaoke ปกติ
        karaoke: [
            /\bkaraoke\b/i,
            /คาราโอเกะ/i
        ],

        // Karaoke MIDI
        karaokeMidi: [
            /\bkaraoke\s+midi\b/i,
            /\bmidi\s+karaoke\b/i,
            /คาราโอเกะ\s+midi/i,
            /midi\s+คาราโอเกะ/i
        ],

        // MIDI
        midi: [
            /\bmidi\b/i
        ],

        // เครื่องดนตรี / backing
        backing: [
            /backing\s*track/i,
            /instrumental/i,
            /minus\s*one/i,
            /ดนตรี/i,
            /ไม่มีเสียงร้อง/i,
            /ไม่มีนักร้อง/i,
            /ร้องตาม/i
        ]
    };

    function matchesAny(
        text,
        patterns
    ) {
        return patterns.some(
            pattern =>
                pattern.test(text)
        );
    }

    /*
     * ============================================================
     * SCORE
     * ============================================================
     *
     * สำคัญ:
     *
     * Karaoke ปกติ
     *      ↓
     * Karaoke MIDI
     *      ↓
     * MIDI
     *      ↓
     * Backing / Instrumental
     */

    function calculateScore(item) {

        const title =
            item.title || "";

        const channel =
            item.channel || "";

        const text =
            `${title} ${channel}`;

        let score = 0;

        const hasKaraoke =
            matchesAny(
                text,
                karaokePatterns.karaoke
            );

        const hasKaraokeMidi =
            matchesAny(
                text,
                karaokePatterns.karaokeMidi
            );

        const hasMidi =
            matchesAny(
                text,
                karaokePatterns.midi
            );

        const hasBacking =
            matchesAny(
                text,
                karaokePatterns.backing
            );

        /*
         * --------------------------------------------------------
         * KARAOKE ปกติ
         * --------------------------------------------------------
         *
         * ให้คะแนนสูงสุด
         */

        if (hasKaraoke) {
            score += 1000;
        }

        /*
         * --------------------------------------------------------
         * KARAOKE MIDI
         * --------------------------------------------------------
         *
         * ต้องต่ำกว่า Karaoke ปกติ
         */

        if (hasKaraokeMidi) {
            score += 200;
        }

        /*
         * --------------------------------------------------------
         * MIDI
         * --------------------------------------------------------
         */

        if (hasMidi) {
            score += 100;
        }

        /*
         * --------------------------------------------------------
         * BACKING / INSTRUMENTAL
         * --------------------------------------------------------
         */

        if (hasBacking) {
            score += 50;
        }

        /*
         * --------------------------------------------------------
         * ถ้า Karaoke อยู่ในชื่อเพลงโดยตรง
         * ให้เพิ่มคะแนน
         * --------------------------------------------------------
         */

        if (
            matchesAny(
                title,
                karaokePatterns.karaoke
            )
        ) {
            score += 150;
        }

        /*
         * Karaoke MIDI ที่ชื่อเพลงโดยตรง
         */

        if (
            matchesAny(
                title,
                karaokePatterns.karaokeMidi
            )
        ) {
            score += 50;
        }

        /*
         * MIDI อย่างเดียว
         *
         * ไม่ให้แซง Karaoke
         */

        if (
            hasMidi &&
            !hasKaraoke
        ) {
            score += 20;
        }

        return score;
    }

    /*
     * ============================================================
     * FILTER
     * ============================================================
     */

    const filtered = [];

    for (
        const item
        of uniqueResults.values()
    ) {

        const text =
            `${item.title} ${item.channel}`;

        /*
         * --------------------------------------------------------
         * ตัด MV / Live / Lyrics / Cover ฯลฯ
         * --------------------------------------------------------
         */

        const isBlocked =
            blockedPatterns.some(
                pattern =>
                    pattern.test(text)
            );

        if (isBlocked) {
            continue;
        }

        /*
         * --------------------------------------------------------
         * ต้องเป็น Karaoke / MIDI / Backing เท่านั้น
         * --------------------------------------------------------
         */

        const isKaraoke =
            matchesAny(
                text,
                karaokePatterns.karaoke
            );

        const isKaraokeMidi =
            matchesAny(
                text,
                karaokePatterns.karaokeMidi
            );

        const isMidi =
            matchesAny(
                text,
                karaokePatterns.midi
            );

        const isBacking =
            matchesAny(
                text,
                karaokePatterns.backing
            );

        if (
            !isKaraoke &&
            !isKaraokeMidi &&
            !isMidi &&
            !isBacking
        ) {
            continue;
        }

        /*
         * --------------------------------------------------------
         * SCORE
         * --------------------------------------------------------
         */

        item.score =
            calculateScore(item);

        filtered.push(item);
    }

    /*
     * ============================================================
     * SORT
     * ============================================================
     *
     * คะแนนสูงสุดก่อน
     */

    filtered.sort(
        (a, b) => {

            if (
                b.score !==
                a.score
            ) {
                return (
                    b.score -
                    a.score
                );
            }

            /*
             * ถ้าคะแนนเท่ากัน
             * ให้ผลที่มี Karaoke ในชื่อขึ้นก่อน
             */

            const aKaraoke =
                matchesAny(
                    a.title,
                    karaokePatterns.karaoke
                );

            const bKaraoke =
                matchesAny(
                    b.title,
                    karaokePatterns.karaoke
                );

            if (
                aKaraoke !==
                bKaraoke
            ) {
                return bKaraoke ? 1 : -1;
            }

            return (
                a.title || ""
            ).localeCompare(
                b.title || "",
                "th"
            );
        }
    );

    /*
     * ============================================================
     * RETURN
     * ============================================================
     */

    const results =
        filtered
            .slice(0, 20)
            .map(item => ({

                videoId:
                    item.videoId,

                title:
                    item.title,

                channel:
                    item.channel,

                thumbnail:
                    item.thumbnail,

                duration:
                    item.duration,

                url:
                    item.url
            }));

    return Response.json({

        success: true,

        query: q,

        results
    });
}
