import './style.css';
import { hasWebGPU, loadModel } from './model';
import { MOODS, classify, draftReply, splitReviews, urgency, type Business, type Mood } from './replies';

interface Card {
  review: string;
  mood: Mood | null;
  urgent: string | null;
  reply: string;
  busy: boolean;
}

const SAMPLE_BUSINESS: Business = {
  name: 'Chai Point Corner',
  about: 'a small tea and snacks café in Pune',
  owner: 'Priya',
  contact: 'WhatsApp at 98765 43210',
};

const SAMPLE_REVIEWS = `Best masala chai in the area!! Vada pav was hot and fresh. Will come again with friends.

Found a hair in my poha. Disgusting. Want my money back.

Nice ambience, friendly owner aunty. Sandwich was soggy though.

Waited 25 minutes for two sandwiches and the guy at the counter was rude when I asked.`;

const app = document.querySelector<HTMLDivElement>('#app')!;
let business: Business = readBusiness();
let cards: Card[] = [];
let modelLabel = '';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function readBusiness(): Business {
  try {
    const saved = JSON.parse(localStorage.getItem('rd-business') ?? 'null');
    if (saved?.name) return saved;
  } catch {
    /* fall through */
  }
  return { name: '', about: '', owner: '', contact: '' };
}

function saveBusiness() {
  try {
    localStorage.setItem('rd-business', JSON.stringify(business));
  } catch {
    /* private mode: it just won't be remembered */
  }
}

async function render() {
  const gpu = await hasWebGPU();
  app.innerHTML = `
    <main>
      <header>
        <p class="kicker">Reply Desk</p>
        <h1>Answer every review.<br/>Keep every customer's words on your own computer.</h1>
        <p class="lede">Paste your Google or Zomato reviews. An open-weight model running in this browser tab sorts them, flags the ones you must see today, and drafts a reply to each in your voice. Nothing is uploaded.</p>
      </header>

      <section class="panel">
        <h2>Your business</h2>
        <div class="grid">
          <label>Business name<input id="name" value="${esc(business.name)}" placeholder="Chai Point Corner" /></label>
          <label>Your name (signs the replies)<input id="owner" value="${esc(business.owner)}" placeholder="Priya" /></label>
          <label class="wide">What it is<input id="about" value="${esc(business.about)}" placeholder="a small tea and snacks café in Pune" /></label>
          <label class="wide">Where unhappy customers should reach you<input id="contact" value="${esc(business.contact)}" placeholder="WhatsApp at 98765 43210" /></label>
        </div>
      </section>

      <section class="panel">
        <div class="row">
          <h2>Reviews</h2>
          <button class="link" id="sample">Fill in an example</button>
        </div>
        <textarea id="reviews" rows="8" placeholder="Paste reviews here, with a blank line between each one."></textarea>
        <button class="primary" id="go">Draft replies</button>
        <p class="status" id="status" role="status">${gpu ? 'Runs on your GPU.' : 'No WebGPU here, so it runs on your CPU: slower (about 10 s a reply) but it works.'} The first run downloads Gemma 3 1B once (~800 MB–1 GB); after that it works offline.</p>
      </section>

      <section id="results"></section>

      <footer>Gemma 3 1B (open weights, Google) via Transformers.js · Your reviews and replies never leave this device · <a href="https://github.com/Yash11778/reply-desk">Source</a></footer>
    </main>`;

  for (const key of ['name', 'owner', 'about', 'contact'] as const) {
    document.querySelector<HTMLInputElement>(`#${key}`)!.oninput = (e) => {
      business[key] = (e.target as HTMLInputElement).value.trim();
      saveBusiness();
    };
  }
  document.querySelector<HTMLButtonElement>('#sample')!.onclick = () => {
    business = { ...SAMPLE_BUSINESS };
    saveBusiness();
    render().then(() => (document.querySelector<HTMLTextAreaElement>('#reviews')!.value = SAMPLE_REVIEWS));
  };
  document.querySelector<HTMLButtonElement>('#go')!.onclick = run;
}

function status(text: string, error = false) {
  const el = document.querySelector('#status')!;
  el.textContent = text;
  el.classList.toggle('error', error);
}

async function run() {
  const reviews = splitReviews(document.querySelector<HTMLTextAreaElement>('#reviews')!.value);
  if (!business.name || !business.owner) return status('Add your business name and your name first.', true);
  if (!reviews.length) return status('Paste at least one review.', true);

  const go = document.querySelector<HTMLButtonElement>('#go')!;
  go.disabled = true;
  try {
    status('Loading the model…');
    modelLabel = await loadModel((f, mb) =>
      status(f < 1 ? `Downloading Gemma once: ${Math.round(f * 100)}% of ${Math.round(mb)} MB` : 'Starting the model…'),
    );

    // Urgent ones are known instantly (keywords), so show them first while the model works.
    cards = reviews
      .map((review) => ({ review, mood: null, urgent: urgency(review), reply: '', busy: true }) as Card)
      .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
    renderCards();

    for (const [i, card] of cards.entries()) {
      status(`Reading review ${i + 1} of ${cards.length} on your ${modelLabel}${modelLabel === 'CPU' && !crossOriginIsolated ? ' (single thread)' : ''}…`);
      // A food-safety or rude-staff complaint is never a happy review, and skipping
      // the model call here saves a round on slow CPUs.
      card.mood = card.urgent ? 'negative' : await classify(card.review);
      renderCards();
      card.reply = await draftReply(card.review, card.mood, business);
      card.busy = false;
      renderCards();
    }
    const urgent = cards.filter((c) => c.urgent).length;
    status(`Done. ${cards.length} replies drafted${urgent ? `, ${urgent} flagged for today` : ''}. Read each one before you post it.`);
  } catch (e) {
    console.error(e);
    status(e instanceof Error ? e.message : 'Something went wrong.', true);
  } finally {
    go.disabled = false;
  }
}

function renderCards() {
  const el = document.querySelector('#results')!;
  el.innerHTML = cards
    .map(
      (c, i) => `
      <article class="card ${c.urgent ? 'urgent' : ''}">
        <div class="meta">
          ${c.urgent ? `<span class="flag">Today: ${esc(c.urgent)}</span>` : ''}
          ${MOODS.map(
            (m) => `<button class="mood ${c.mood === m ? 'on' : ''}" data-i="${i}" data-mood="${m}" ${c.busy ? 'disabled' : ''} title="Redraft as ${m}">${m}</button>`,
          ).join('')}
        </div>
        <blockquote>${esc(c.review)}</blockquote>
        ${
          c.busy
            ? `<p class="drafting">${c.mood ? 'Drafting a reply…' : 'Reading…'}</p>`
            : `<textarea data-i="${i}" rows="4">${esc(c.reply)}</textarea>
               <div class="actions"><button class="copy" data-i="${i}">Copy reply</button></div>`
        }
      </article>`,
    )
    .join('');

  el.querySelectorAll<HTMLButtonElement>('.mood').forEach((b) => {
    b.onclick = async () => {
      const card = cards[Number(b.dataset.i)];
      card.mood = b.dataset.mood as Mood;
      card.busy = true;
      renderCards();
      card.reply = await draftReply(card.review, card.mood, business);
      card.busy = false;
      renderCards();
    };
  });
  el.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((t) => {
    t.oninput = () => (cards[Number(t.dataset.i)].reply = t.value);
  });
  el.querySelectorAll<HTMLButtonElement>('.copy').forEach((b) => {
    b.onclick = async () => {
      await navigator.clipboard.writeText(cards[Number(b.dataset.i)].reply);
      b.textContent = 'Copied';
      setTimeout(() => (b.textContent = 'Copy reply'), 1500);
    };
  });
}

render();
