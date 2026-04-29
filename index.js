async function readAndScan(filePath, type) {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    let content = "";

    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        await client.downloadTo(
            {
                write: (data) => {
                    content += data.toString();
                }
            },
            filePath
        );

        client.close();

    } catch (err) {
        console.log(`❌ READ FAIL: ${filePath}`);
        client.close();
        return;
    }

    const lines = content.split("\n");

    for (const line of lines) {

        if (type === "RPT" && line.toLowerCase().includes("lootmax")) {
            console.log("\n🔥 LOOTMAX HIT");
            console.log(line);
        }

        if (type === "ADM" && line.toLowerCase().includes("killed by")) {
            console.log("\n💀 KILL HIT");
            console.log(line);
        }
    }
}
