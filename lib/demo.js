// Generates realistic-looking DEMO responses so the admin analytics can be previewed.
// Every record carries demo:true so it can be removed from the dashboard in one click.
const crypto = require('crypto');
const SURVEY = require('../public/questions.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMENTS_29 = [
  'Better placement training, modern labs and more industry internships.',
  'Affordable fees, good hostel food and a stronger placement cell.',
  'More practical sessions, updated syllabus and regular industry visits.',
  'Transparent scholarship process, Wi-Fi across campus and sports facilities.',
  'Faculty who are approachable, more coding clubs and a proper innovation lab.',
  'Safe transport, cleaner hostels and quick response from management.',
  'Mentoring from alumni, more certifications inside the curriculum and AI courses.',
  'Better canteen, air-conditioned library and flexible hostel timings.',
  'Guaranteed internships, foreign language classes and strong career counselling.',
  'Lower fees for merit students, modern classrooms and more cultural events.',
  'Live projects with companies, a start-up incubation centre and better placement stats.',
  'Open communication with the principal, reduced attendance pressure and good Wi-Fi.'
];
const COMMENTS_30 = [
  'Placement record and the companies that actually visit campus.',
  'Faculty quality and how much practical exposure I will get.',
  'Fees and scholarships, because the family budget matters a lot.',
  'Reputation of the college and what seniors say about it.',
  'Campus facilities, hostel and a safe environment.',
  'Industry connections and internship opportunities.',
  'Location close to home and good transport.',
  'Modern labs and a focus on projects rather than only theory.',
  'Alumni network and mentoring for higher studies abroad.',
  'A balanced campus life with clubs, sports and technical events.'
];

const FIRST = ['Anjali', 'Arjun', 'Fathima', 'Rahul', 'Meera', 'Adithya', 'Nandana', 'Sreehari', 'Ayisha', 'Vishnu', 'Devika', 'Mohammed', 'Gopika', 'Abhijith', 'Sneha', 'Akhil', 'Lakshmi', 'Hari', 'Neha', 'Jerin'];
const LAST = ['Menon', 'Nair', 'Krishnan', 'Das', 'Pillai', 'Varma', 'Rahman', 'Kumar', 'Thomas', 'Sharma', 'Iyer', 'Joseph', 'Raj', 'Mohan', 'Babu', 'Subramanian'];

function generate(count, seed) {
  const rnd = mulberry32(seed || 2026);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const weighted = (n, weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    for (let i = 0; i < n; i++) { r -= weights[i]; if (r <= 0) return i; }
    return n - 1;
  };

  // Stable popularity per option so the dashboard shows a believable ranking rather than noise.
  const popularity = {};
  SURVEY.questions.forEach((q) => {
    if (q.options) popularity[q.id] = q.options.map(() => 0.25 + rnd() * 0.75);
  });
  // Lift the options a real cohort would favour.
  const boost = (qid, label, f) => {
    const i = SURVEY.byId[qid].options.indexOf(label);
    if (i >= 0) popularity[qid][i] *= f;
  };
  boost(15, 'Placement & salary opportunities', 2.4); boost(15, 'Academic quality', 1.8);
  boost(15, 'Fees', 1.6); boost(15, 'Internship opportunities', 1.5); boost(15, 'Infrastructure', 1.3);
  boost(3, 'Engineering', 4.5); boost(3, 'Management', 1.2);
  boost(4, 'Kerala', 3); boost(1, '+2', 1.8); boost(1, 'UG', 1.2);
  boost(16, 'Combination of theory and practical learning', 3);
  boost(24, 'Placement in India', 2.5); boost(24, 'Higher studies abroad', 1.5);
  boost(19, 'Internships', 2.2);
  boost(17, 'Technical/professional skills', 1.8); boost(17, 'Coding/digital skills', 1.6); boost(17, 'AI & technology', 1.5);
  boost(20, 'Advanced laboratories', 1.7); boost(20, 'Wi-Fi/digital infrastructure', 1.8);
  boost(21, 'Good food', 2.2); boost(21, 'Cleanliness', 1.8);
  boost(27, 'Placement support', 1.8); boost(27, 'Career counselling', 1.5);
  boost(26, 'Good placement', 2); boost(26, 'Practical skills', 1.7);

  // Per-question mean rating (1-5), then a skewed draw around it.
  const ratingMean = {};
  SURVEY.questions.filter((q) => q.type === 'rating').forEach((q) => { ratingMean[q.id] = 3.2 + rnd() * 1.4; });
  ratingMean[6] = 4.6; ratingMean[25] = 4.5; ratingMean[5] = 4.4; ratingMean[10] = 4.2; ratingMean[13] = 3.1;

  const out = [];
  const now = Date.now();
  for (let n = 0; n < count; n++) {
    const answers = {};
    SURVEY.questions.forEach((q) => {
      if (q.type === 'single') {
        answers[q.id] = q.options[weighted(q.options.length, popularity[q.id])];
      } else if (q.type === 'multi') {
        const k = Math.max(1, Math.min(q.max, q.max - Math.floor(rnd() * 2)));
        const scored = q.options
          .map((o, i) => ({ o, s: popularity[q.id][i] * (0.15 + rnd() * 1.3) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, k)
          .map((x) => x.o);
        answers[q.id] = scored;
      } else if (q.type === 'rating') {
        const v = Math.round(ratingMean[q.id] + (rnd() - 0.5) * 2.4);
        answers[q.id] = Math.max(1, Math.min(5, v));
      } else if (q.type === 'text') {
        answers[q.id] = rnd() < 0.7 ? pick(q.id === 29 ? COMMENTS_29 : COMMENTS_30) : '';
      }
    });
    // Newer days a little busier than older ones.
    const daysAgo = Math.floor(Math.pow(rnd(), 1.5) * 21);
    const ts = now - daysAgo * 86400000 - Math.floor(rnd() * 86400000);
    const first = pick(FIRST), last = pick(LAST);
    out.push({
      id: crypto.randomUUID(), ts: Math.min(ts, now), demo: true,
      name: first + ' ' + last,
      email: (first + '.' + last + Math.floor(rnd() * 90 + 10)).toLowerCase() + '@example.com',
      answers: answers
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

module.exports = { generate };
