const ftp = require("basic-ftp");

async function run() {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        console.log("Connected");

        // STEP 1: go to mission root FIRST
        await client.cd("/dayzps_missions/dayzOffline.chernarusplus");

        console.log("In mission directory");

        // STEP 2: ensure custom folder exists here
        await client.ensureDir("custom");

        console.log("Custom folder ready");

        // STEP 3: create file content
        const buffer = Buffer.from("test1", "utf-8");

        // STEP 4: upload file INTO that folder
        await client.uploadFrom(buffer, "custom/test.xml");

        console.log("File uploaded");

        // VERIFY
        const list = await client.list("custom");
        console.log("Custom folder contents:", list.map(f => f.name));

    } catch (err) {
        console.error("FAILED:", err);
    }

    client.close();
}

run();
