# Reply Desk

Paste your Google or Zomato reviews. An open-weight model running **in your browser tab**
sorts them, flags the ones you must deal with today, and drafts a reply to each one in
your own voice. Your customers' words never leave your computer.


Built for the [Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).

## Who it's for

Small businesses that live on reviews: cafés, salons, clinics, coaching centres, home
bakers. Replying to every review is good for them and nobody has time for it. The ones
that matter most, like "found a hair in my food" or "staff was rude", get buried under
"nice chai!".

## How it works

1. **Set up once:** business name, what it is, your name, and where unhappy customers
   should reach you. It's saved in your browser.
2. **Paste reviews,** with a blank line between each.
3. **Urgent first:** a plain keyword check flags food-safety, health, money and
   staff-behaviour complaints instantly, before the model has even started.
4. **Gemma reads each review** and decides whether it's positive, mixed or negative.
5. **Gemma drafts the reply** with a prompt written for that mood. A 1B model follows one
   clear instruction far better than "if bad, apologise".
6. **You edit and copy.** Wrong mood? Tap another and it redrafts.

## Why an open model

- **Privacy:** reviews often carry names, phone numbers and complaints about staff.
  Nothing is uploaded.
- **Cost:** every reply costs nothing to generate, so the economics work at a price a
  small shop will pay.
- **No lock-in:** no API key, no account, no per-token pricing that can change.

## Run it

```bash
npm install
npm run dev
```

It uses [Transformers.js](https://huggingface.co/docs/transformers.js) with
`onnx-community/gemma-3-1b-it-ONNX`: WebGPU when the browser has it, otherwise WebAssembly
on the CPU (slower, about 10 s a reply, but it works everywhere). The weights (~800 MB–1 GB)
download once and are cached by the browser.

## License

MIT. Gemma is used under the [Gemma Terms of Use](https://ai.google.dev/gemma/terms).
