import { ask } from './model';

export interface Business {
  name: string;
  /** "a small tea and snacks café in Pune" */
  about: string;
  owner: string;
  /** Where an unhappy customer should go, e.g. "WhatsApp at 98765 43210". */
  contact: string;
}

export type Mood = 'positive' | 'mixed' | 'negative';
export const MOODS: Mood[] = ['positive', 'mixed', 'negative'];

/**
 * A 1B model handles one clear job far better than "if bad, then apologise".
 * So the mood is decided first, and each mood gets its own instruction.
 */
const TASK: Record<Mood, (b: Business) => string> = {
  positive: () => 'Thank them for their review.',
  mixed: () => "Thank them for the good part, and say plainly that you'll look at the thing they didn't like.",
  negative: (b) =>
    `Apologise once, without excuses, and ask them to contact you ${b.contact ? `on ${b.contact}` : 'directly'} so you can make it right.`,
};

/**
 * Words that signal any complaint at all. A review with none of them is positive,
 * and the model isn't asked: the CPU (int8) build in particular tends to hedge
 * with "mixed" on reviews that are plainly happy.
 */
const COMPLAINT =
  /\b(but|though|however|although|except|not|no|never|bad|worst|poor|cold|soggy|stale|slow|late|wait(ed|ing)?|rude|dirty|unclean|expensive|overpriced|tiny|bland|salty|oily|burnt|raw|wrong|missing|disappoint\w*|average|okay|ok|meh)\b|n't\b/i;

export const hasComplaint = (review: string) => COMPLAINT.test(review);

export async function classify(review: string): Promise<Mood> {
  if (!hasComplaint(review)) return 'positive';
  const answer = await ask(
    `This customer review contains a complaint. Is it mixed (it also praises something) or negative (no praise at all)? Answer with one word.\n\nReview: "${review}"`,
    4,
  );
  const word = answer.toLowerCase().replace(/[^a-z]/g, '');
  return word === 'negative' ? 'negative' : 'mixed';
}

export async function draftReply(review: string, mood: Mood, b: Business): Promise<string> {
  const prompt = `You are ${b.owner}, owner of ${b.name}, ${b.about}. Write your public reply to this customer review.

Review: "${review}"

What to do: ${TASK[mood](b)}

Rules:
- 2 to 3 short sentences. Mention the specific thing they talked about.
- Sound like a real person, warm and plain. No emoji, no hashtags, no quotation marks, no greeting line.
- Do not invent phone numbers, emails, discounts or promises.
- End with: ${b.owner}

Write only the reply.`;
  return clean(await ask(prompt, 140), b.owner);
}

/** Small models wrap answers in chatter, markdown and placeholders. Strip all of it. */
export function clean(text: string, owner: string): string {
  const lines = text
    .replace(/\*\*/g, '')
    .split('\n')
    .map((l) => l.trim().replace(/^["“”']+|["“”']+$/g, ''))
    .filter((l) => l && !/^(okay|ok|sure|here'?s|here is)\b/i.test(l))
    .filter((l) => !/\[[^\]]*\]/.test(l)) // "Dear [Reviewer Name]," and friends
    .filter((l) => !/^(hi|hello|dear)\b[^.!?]*,$/i.test(l));
  let body = lines.join(' ').replace(/\s+/g, ' ').trim();
  // Make the sign-off exactly once, on its own line.
  const sign = new RegExp(`[\\s,–—-]*${escapeRe(owner)}[.!]?$`, 'i');
  body = body.replace(sign, '').trim();
  return `${body}\n${owner}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Things a shop owner needs to see before anything else. Plain keywords, not the
 * model: a missed food-safety complaint is the one mistake that matters, and a
 * word list is predictable.
 */
const URGENT: [RegExp, string][] = [
  [/\b(hair|cockroach|insect|worm|fly|flies|bug|rat|mouse|lizard|glass|plastic|stone)\b.*\b(in|found)\b|\b(found)\b.*\b(hair|cockroach|insect|worm|bug|glass)\b/i, 'Something found in the food'],
  [/\b(sick|vomit\w*|food poisoning|diarrh\w*|stomach (ache|pain|upset)|ill after|hospital|allerg\w*)\b/i, 'Health complaint'],
  [/\b(stale|expired|spoilt|spoiled|rotten|smelly|smelt|stinks?|fungus|mou?ldy?)\b/i, 'Food quality'],
  [/\b(refund|money back|chargeback|overcharg\w*|cheat\w*|scam|fraud|extra money)\b/i, 'Money'],
  [/\b(rude|abus\w*|shout\w*|yell\w*|insult\w*|misbehav\w*|harass\w*)\b/i, 'Staff behaviour'],
  [/\b(police|consumer (forum|court)|legal|lawyer|complain(t)? to)\b/i, 'Escalation threat'],
];

export function urgency(review: string): string | null {
  for (const [re, label] of URGENT) if (re.test(review)) return label;
  return null;
}

/** Reviews pasted from Google or Zomato arrive as blocks separated by blank lines. */
export function splitReviews(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter((r) => r.length > 3);
}
