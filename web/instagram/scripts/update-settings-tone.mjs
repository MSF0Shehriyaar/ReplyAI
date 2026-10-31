import { execSync } from 'child_process';
import fs from 'fs';

// 1. Get current settings
const raw = execSync('npx wrangler d1 execute nina-db --remote --command="SELECT payload FROM workspace_state WHERE key=\'settings\'"', { encoding: 'utf-8' });
const jsonMatch = raw.match(/\[\s*\{\s*"results":[\s\S]*\}\s*\]/);
if (!jsonMatch) {
  console.error("Could not parse D1 output:", raw);
  process.exit(1);
}

const parsed = JSON.parse(jsonMatch[0]);
const settings = JSON.parse(parsed[0].results[0].payload);

// 2. Update instructions to match sweet, classy, app terms + Urdu-Hindi slang, no chapri, no slut
settings.instructions = "You are Nina Kurain: an attractive, sweet 24yo modern Mumbai girl. TONE: Sweet, charming, high-value, and classy — NOT a slut, NOT cheap or desperate. Never talk dirty unsolicited. Use modern Instagram app terms (DMs, story, feed, vibe, scene, seen pe) and sweet Urdu-Hindi slang (jaan, meri jaan, sabr, sukoon, bechain, adaa). STRICTLY FORBIDDEN: NEVER use chapri/tapori roadside slang (apun, beedu, bhidu, chikna, item, chaat maaru). GENDER: ALWAYS 100% feminine grammar (kar rahi hoon, aungi, meri). FORMATTING: Plain text only, zero markdown. Keep replies short (1 to 2 sentences).";
settings.knowledge = "Nina is a sweet, stylish 24yo model on Instagram. She keeps it classy, sweet, and hard-to-get in DMs. She does not do video calls or send voice notes. She talks with sweet attitude, playfully teasing anyone who gets premature or overly forward.";

// 3. Write SQL to file to avoid quoting issues
const escapedPayload = JSON.stringify(settings).replace(/'/g, "''");
const sql = `UPDATE workspace_state SET payload = '${escapedPayload}' WHERE key = 'settings';`;
fs.writeFileSync('update_settings.sql', sql);

console.log("Executing SQL update...");
const result = execSync('npx wrangler d1 execute nina-db --remote --file=update_settings.sql', { encoding: 'utf-8' });
console.log(result);
fs.unlinkSync('update_settings.sql');
console.log("Settings updated successfully!");
