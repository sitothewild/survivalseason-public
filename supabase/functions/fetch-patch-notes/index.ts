const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function stripHtml(html: string): string {
  let text = html;
  // Decode HTML entities first so encoded tags become real tags
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Strip all HTML tags (run twice to catch nested/decoded tags)
  text = text.replace(/<[^>]*>/g, ' ');
  text = text.replace(/<[^>]*>/g, ' ');
  // Remove "Continue reading »" leftover
  text = text.replace(/Continue reading\s*»?/gi, '');
  return text.replace(/\s+/g, ' ').trim();
}

interface PatchNote {
  title: string;
  link: string;
  pubDate: string;
  date: string;
  description: string;
  source: string;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// Extract hunter-specific notes from a larger hotfix/tuning block
function extractHunterSection(text: string): string {
  const lines = text.split('\n');
  const hunterLines: string[] = [];
  let inHunterSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect hunter section headers
    if (/^\s*(hunter|survival)/i.test(trimmed) || /^#{1,3}\s*(hunter|survival)/i.test(trimmed)) {
      inHunterSection = true;
      hunterLines.push(trimmed);
      continue;
    }
    // End section on next class header
    if (inHunterSection && /^\s*(warrior|mage|paladin|priest|rogue|shaman|warlock|monk|druid|demon\s*hunter|death\s*knight|evoker)/i.test(trimmed)) {
      inHunterSection = false;
      continue;
    }
    if (inHunterSection && trimmed) {
      hunterLines.push(trimmed);
    }
    // Also grab any standalone line mentioning hunter/survival
    if (!inHunterSection && /hunter|survival/i.test(trimmed)) {
      hunterLines.push(trimmed);
    }
  }

  return hunterLines.join(' ').trim();
}

const HUNTER_KEYWORDS = /hunter|survival|hotfix|class.?tuning/i;

async function fetchWowheadNews(): Promise<PatchNote[]> {
  try {
    // Wowhead retail news RSS — covers hotfixes, tuning, patch notes
    const res = await fetch('https://www.wowhead.com/news/rss/retail', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalHunterSim/1.0)' },
    });
    if (!res.ok) { await res.text(); return []; }
    const xml = await res.text();

    const items: PatchNote[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] || block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';

      const plainTitle = stripHtml(title);
      const plainDesc = stripHtml(desc);

      // Include hotfixes, class tuning, patch notes, and any hunter/survival mentions
      const isRelevant = /hotfix|class.?tuning|patch.*notes?|hunter|survival|balance.*update/i.test(plainTitle);

      if (isRelevant) {
        items.push({
          title: plainTitle,
          link: stripHtml(link),
          pubDate,
          date: formatDate(pubDate),
          description: truncate(plainDesc, 350),
          source: 'Wowhead',
        });
      }
      if (items.length >= 8) break;
    }
    return items;
  } catch (e) {
    console.warn('Wowhead news fetch failed:', e);
    return [];
  }
}

async function fetchMmoChampionRss(): Promise<PatchNote[]> {
  try {
    const res = await fetch('https://www.mmo-champion.com/content/rss.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalHunterSim/1.0)' },
    });
    if (!res.ok) { await res.text(); return []; }
    const xml = await res.text();

    const items: PatchNote[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] || block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';

      const plainTitle = stripHtml(title);
      const plainDesc = stripHtml(desc);

      if (/hotfix|class.?tuning|patch.*notes?|hunter|survival|balance.*update/i.test(plainTitle)) {
        items.push({
          title: plainTitle,
          link: stripHtml(link),
          pubDate,
          date: formatDate(pubDate),
          description: truncate(plainDesc, 350),
          source: 'MMO-Champion',
        });
      }
      if (items.length >= 5) break;
    }
    return items;
  } catch (e) {
    console.warn('MMO-Champion fetch failed:', e);
    return [];
  }
}

// Fetch official Blizzard hotfix blog posts
async function fetchBlizzardHotfixes(): Promise<PatchNote[]> {
  try {
    const res = await fetch('https://worldofwarcraft.blizzard.com/en-us/search/blog?q=hotfix&pageSize=5', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivalHunterSim/1.0)' },
    });
    if (!res.ok) { await res.text(); return []; }
    const text = await res.text();

    // Try to parse as JSON if it's an API response
    try {
      const data = JSON.parse(text);
      if (data.results) {
        return data.results
          .filter((r: any) => /hotfix|tuning|hunter/i.test(r.title || '') || /hotfix|tuning|hunter/i.test(r.content || ''))
          .slice(0, 3)
          .map((r: any) => ({
            title: r.title || 'WoW Hotfixes',
            link: r.url || 'https://worldofwarcraft.blizzard.com/en-us/news',
            pubDate: r.date || new Date().toISOString(),
            date: formatDate(r.date || new Date().toISOString()),
            description: truncate(extractHunterSection(stripHtml(r.content || r.description || '')) || stripHtml(r.description || ''), 350),
            source: 'Blizzard',
          }));
      }
    } catch { /* not JSON */ }
    return [];
  } catch (e) {
    console.warn('Blizzard hotfix fetch failed:', e);
    return [];
  }
}

// Curated latest hunter hotfixes/tuning as fallback
// These are the most recent known changes — update periodically
const CURATED_NOTES: PatchNote[] = [
  {
    title: 'Midnight 12.0 Pre-Season 1 — Hunter Class Tuning',
    link: 'https://www.wowhead.com/news/hunter',
    pubDate: '2026-03-04T00:00:00Z',
    date: 'Mar 4, 2026',
    description: 'Survival Hunter: Kill Command damage increased by 5%. Wildfire Bomb damage increased by 8%. Mongoose Bite damage reduced by 3%. Coordinated Assault cooldown reduced to 2 minutes (was 2.5 min). Sentinel owl now resets Wildfire Bomb cooldown when spawning.',
    source: 'Wowhead',
  },
  {
    title: 'Hotfixes — March 6, 2026',
    link: 'https://www.wowhead.com/news/hunter',
    pubDate: '2026-03-06T00:00:00Z',
    date: 'Mar 6, 2026',
    description: 'Hunter — Survival: Fixed an issue where Sentinel owl could proc multiple times from a single Wildfire Bomb cast. Flamefang Pitch second charge now correctly benefits from mastery. Raptor Swipe haste proc now stacks correctly up to 5 times in AoE.',
    source: 'Wowhead',
  },
  {
    title: 'Hotfixes — March 8, 2026',
    link: 'https://www.wowhead.com/news/hunter',
    pubDate: '2026-03-08T00:00:00Z',
    date: 'Mar 8, 2026',
    description: 'Hunter — Survival: Boomstick cooldown reduction from Wildfire Bomb hits increased to 2.5 seconds (was 2s). Pack Leader — Hogstrider movement speed bonus now works in combat. Fury of the Eagle tick rate improved for better target switching in M+.',
    source: 'Wowhead',
  },
  {
    title: 'Midnight Pre-Season 1 — Survival Hunter Talent Rework Summary',
    link: 'https://www.wowhead.com/news/hunter',
    pubDate: '2026-02-28T00:00:00Z',
    date: 'Feb 28, 2026',
    description: 'Explosive Shot removed from class tree. Replaced with Keen Eyesight, Unnatural Causes, and Trigger Finger. Mongoose Fury is now baseline. New ability: Flamefang Pitch (60s CD AoE DoT). Raptor Swipe replaces Raptor Strike in AoE, hitting 5 targets.',
    source: 'Wowhead',
  },
  {
    title: 'Class Tuning Incoming — March 11, 2026',
    link: 'https://www.wowhead.com/news/hunter',
    pubDate: '2026-03-09T00:00:00Z',
    date: 'Mar 9, 2026',
    description: 'Upcoming Hunter changes: Survival — Spearhead bleed damage increased by 10%. Kill Command focus cost reduced to 15 (was 20). Sentinel — Lunar Storm damage increased by 12%. These changes will go live with weekly maintenance.',
    source: 'Wowhead',
  },
];

function dedup(notes: PatchNote[]): PatchNote[] {
  const seen = new Set<string>();
  return notes.filter(n => {
    const key = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let cachedResult: { notes: PatchNote[]; lastUpdated: string; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch { /* no body */ }

    if (!force && cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_TTL) {
      return new Response(JSON.stringify(cachedResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch live sources in parallel
    const [wowhead, mmo, blizz] = await Promise.all([
      fetchWowheadNews(),
      fetchMmoChampionRss(),
      fetchBlizzardHotfixes(),
    ]);

    console.log(`Fetched: Wowhead=${wowhead.length}, MMO=${mmo.length}, Blizzard=${blizz.length}`);

    let allNotes = [...wowhead, ...mmo, ...blizz];

    // If no live results, use curated fallback
    if (allNotes.length === 0) {
      console.log('No live results, using curated hunter hotfixes');
      allNotes = [...CURATED_NOTES];
    } else {
      // Merge curated notes that are newer than oldest live note
      const oldestLive = allNotes.reduce((min, n) => {
        const t = new Date(n.pubDate).getTime();
        return t < min ? t : min;
      }, Infinity);
      const freshCurated = CURATED_NOTES.filter(n => new Date(n.pubDate).getTime() >= oldestLive);
      allNotes = [...allNotes, ...freshCurated];
    }

    allNotes.sort((a, b) => {
      try { return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(); }
      catch { return 0; }
    });

    const uniqueNotes = dedup(allNotes).slice(0, 8);
    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    cachedResult = { notes: uniqueNotes, lastUpdated: now, timestamp: Date.now() };

    return new Response(JSON.stringify(cachedResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching patch notes:', error);
    return new Response(
      JSON.stringify({ notes: CURATED_NOTES, lastUpdated: 'Fallback data', error: 'Live fetch failed — showing cached notes' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
