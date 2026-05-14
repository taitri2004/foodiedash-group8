const { BedrockAgentClient, StartIngestionJobCommand } = require("@aws-sdk/client-bedrock-agent");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const bedrockAgent = new BedrockAgentClient({ region: process.env.AWS_REGION || "us-west-2" });
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });

const KB_BUCKET = process.env.KB_BUCKET || "foodie-knowledgebase";
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID;
const API_URL = process.env.API_URL;

exports.handler = async (event) => {
  console.log("Starting KB sync job...");

  try {
    // Fetch menu data from the API if available
    if (API_URL) {
      try {
        const https = require("https");
        const url = new URL(`${API_URL}/api/products`);
        const data = await new Promise((resolve, reject) => {
          https.get(url, (res) => {
            let body = "";
            res.on("data", (chunk) => body += chunk);
            res.on("end", () => resolve(body));
            res.on("error", reject);
          }).on("error", reject);
        });

        // Upload fetched data to S3 KB bucket
        await s3.send(new PutObjectCommand({
          Bucket: KB_BUCKET,
          Key: `menu_data_${Date.now()}.json`,
          Body: data,
          ContentType: "application/json",
        }));
        console.log("Menu data uploaded to S3 KB bucket");
      } catch (fetchErr) {
        console.warn("Could not fetch from API, skipping upload:", fetchErr.message);
      }
    }

    // Start Bedrock ingestion job
    if (!KNOWLEDGE_BASE_ID || !DATA_SOURCE_ID) {
      console.warn("KNOWLEDGE_BASE_ID or DATA_SOURCE_ID not set, skipping ingestion");
      return { statusCode: 200, body: JSON.stringify({ message: "Skipped: KB IDs not configured" }) };
    }

    const ingestionResponse = await bedrockAgent.send(new StartIngestionJobCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      dataSourceId: DATA_SOURCE_ID,
    }));

    console.log("Ingestion job started:", ingestionResponse.ingestionJob?.ingestionJobId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "KB sync triggered successfully",
        jobId: ingestionResponse.ingestionJob?.ingestionJobId,
      }),
    };
  } catch (err) {
    console.error("Sync KB error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err.message }),
    };
  }
};
