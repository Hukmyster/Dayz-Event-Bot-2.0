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

        const folderPath = "/dayzps_missions/dayzOffline.chernarusplus/custom";
        const filePath = folderPath + "/test1.xml";

        console.log("Ensuring folder exists:", folderPath);
        await client.ensureDir(folderPath);

        console.log("Uploading file:", filePath);

        await client.uploadFrom(
            Buffer.from("test1", "utf-8"),
            filePath
        );

        console.log("UPLOAD COMPLETE");

        const list = await client.list(folderPath);
        console.log("Folder contents:", list.map(f => f.name));

    } catch (err) {
        console.error("FAILED:", err);
    }

    client.close();
}

run();
