export async function onRequest(context) {

    const request = context.request;
    const env = context.env;

    const url = new URL(request.url);

    const roomId =
        url.searchParams.get("room");

    if (!roomId) {

        return Response.json(
            {
                success: false,
                error: "Missing room"
            },
            {
                status: 400
            }
        );

    }

    if (!env.ROOMS) {

        return Response.json(
            {
                success: false,
                error: "ROOMS KV binding not configured"
            },
            {
                status: 500
            }
        );

    }

    const key =
        `room:${roomId}`;

    /*
    ========================================
    GET
    ========================================
    */

    if (request.method === "GET") {

        const room =
            await env.ROOMS.get(
                key,
                "json"
            );

        if (!room) {

            return Response.json({

                success: true,

                room: {
                    id: roomId,
                    queue: [],
                    currentIndex: 0,
                    updatedAt: Date.now()
                }

            });

        }

        return Response.json({

            success: true,

            room

        });

    }


    /*
    ========================================
    POST
    ========================================
    */

    if (request.method === "POST") {

        let body;

        try {

            body =
                await request.json();

        } catch {

            return Response.json(
                {
                    success: false,
                    error: "Invalid JSON"
                },
                {
                    status: 400
                }
            );

        }


        const current =
            await env.ROOMS.get(
                key,
                "json"
            ) || {

                id: roomId,

                queue: [],

                currentIndex: 0,

                updatedAt: Date.now()

            };


        /*
        ================================
        เพิ่มเพลง
        ================================
        */

        if (
            body.action ===
            "add"
        ) {

            const song =
                body.song;

            if (
                !song ||
                !song.videoId
            ) {

                return Response.json(
                    {
                        success: false,
                        error: "Invalid song"
                    },
                    {
                        status: 400
                    }
                );

            }


            /*
            ป้องกันเพลงซ้ำ
            */

            const exists =
                current.queue.some(
                    item =>
                        item.videoId ===
                        song.videoId
                );


            if (!exists) {

                current.queue.push({

                    videoId:
                        song.videoId,

                    title:
                        song.title || "",

                    channel:
                        song.channel || "",

                    thumbnail:
                        song.thumbnail || "",

                    duration:
                        song.duration || "",

                    url:
                        song.url || ""

                });

            }

        }


        /*
        ================================
        ลบเพลง
        ================================
        */

        if (
            body.action ===
            "remove"
        ) {

            const index =
                Number(
                    body.index
                );


            if (
                Number.isInteger(index) &&
                index >= 0 &&
                index <
                    current.queue.length
            ) {

                current.queue.splice(
                    index,
                    1
                );


                if (
                    current.currentIndex >
                    index
                ) {

                    current.currentIndex--;

                }


                if (
                    current.currentIndex >=
                    current.queue.length
                ) {

                    current.currentIndex =
                        Math.max(
                            0,
                            current.queue.length - 1
                        );

                }

            }

        }


        /*
        ================================
        ล้างคิว
        ================================
        */

        if (
            body.action ===
            "clear"
        ) {

            current.queue = [];

            current.currentIndex = 0;

        }


        /*
        ================================
        เปลี่ยนเพลง
        ================================
        */

        if (
            body.action ===
            "setCurrent"
        ) {

            const index =
                Number(
                    body.index
                );


            if (
                Number.isInteger(index) &&
                index >= 0 &&
                index <
                    current.queue.length
            ) {

                current.currentIndex =
                    index;

            }

        }


        /*
        ================================
        บันทึก
        ================================
        */

        current.updatedAt =
            Date.now();


        await env.ROOMS.put(
            key,
            JSON.stringify(current)
        );


        return Response.json({

            success: true,

            room: current

        });

    }


    /*
    ========================================
    Method ไม่รองรับ
    ========================================
    */

    return Response.json(
        {
            success: false,
            error: "Method not allowed"
        },
        {
            status: 405
        }
    );

}
