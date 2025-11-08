export default async function handler(req, res) {
  const url = "https://github.com/Rituraj003/llm-viz/releases/download/v1.0.0/responses_all_with_logprobs.json";
  const r = await fetch(url);

  if (!r.ok) {
    res.status(r.status).send("Failed to fetch remote file");
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // Stream the response directly
  r.body.pipe(res);
}