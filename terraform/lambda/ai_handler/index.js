const { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } = require("@aws-sdk/client-bedrock-agent-runtime");

const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || "us-west-2" });

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Credentials": "true"
};

// Greeting / small-talk detection — respond immediately without hitting Bedrock KB
const GREETING_RE = /^(hi+|he+y+|hello+|howdy|hola|bonjour|chào|xin\s*chào|alo+|yo+|sup|what'?s?\s*up|good\s*(morning|afternoon|evening|night)|chào\s*bạn|bạn\s*ơi|ơi)\s*[!?.]*$/i;
const THANKS_RE   = /^(thanks?|thank\s*you|cảm\s*ơn|camon|tks|ty|ok+|okay|oke+|được|được\s*rồi|tốt\s*rồi|hiểu\s*rồi)\s*[!?.]*$/i;
const HOWRU_RE    = /^(how\s*are\s*you|bạn\s*kh[oỏ]e\s*không|khỏe\s*không|bạn\s*có\s*khỏe|bạn\s*thế\s*nào)\s*[!?.]*$/i;

const GREETING_REPLY = "Xin chào! 👋 Tôi là trợ lý AI dinh dưỡng của FoodieDash.\n\nTôi có thể giúp bạn:\n• Gợi ý món ăn phù hợp sức khỏe\n• Tư vấn chế độ dinh dưỡng\n• Thông tin thành phần & calo món ăn\n• Cảnh báo dị ứng thực phẩm\n\nBạn muốn hỏi về món ăn hay dinh dưỡng gì không? 🍜";
const THANKS_REPLY   = "Không có gì! 😊 Nếu bạn cần tư vấn thêm về món ăn hay dinh dưỡng, cứ hỏi tôi nhé!";
const HOWRU_REPLY    = "Cảm ơn bạn hỏi thăm! 😄 Tôi luôn sẵn sàng hỗ trợ bạn về dinh dưỡng và món ăn. Bạn đang tìm kiếm món gì hôm nay?";

const getSmallTalkReply = (text) => {
  const t = text.trim();
  if (GREETING_RE.test(t)) return GREETING_REPLY;
  if (THANKS_RE.test(t))   return THANKS_REPLY;
  if (HOWRU_RE.test(t))    return HOWRU_REPLY;
  // Very short input (≤3 chars) that isn't a real food question
  if (t.length <= 3)       return GREETING_REPLY;
  return null;
};

exports.handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const question = body.question;

    if (!question) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "Thiếu câu hỏi" })
      };
    }

    // Handle greetings & small talk locally — no Bedrock call needed
    const smallTalkReply = getSmallTalkReply(question);
    if (smallTalkReply) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, answer: smallTalkReply, citations: [] })
      };
    }

    const response = await client.send(new RetrieveAndGenerateCommand({
      input: { text: question },
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
          modelArn: process.env.MODEL_ARN || `arn:aws:bedrock:us-west-2:${process.env.AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`
        }
      }
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        answer: response.output.text,
        citations: response.citations
      })
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: err.message })
    };
  }
};
