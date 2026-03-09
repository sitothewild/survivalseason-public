const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const HUNTER_KEYWORDS = /hunter|survival|hotfix|12\.0|midnight/i;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

interface PatchNote {
  title: string;
  link: string;
  pubDate: string;
  date: string;
  description: string;
  source: string;
}

async function fetchMmoChampionRss(): Promise<PatchNote[]> {
  try {
    const res = await fetch('https://www.mmo-champion.com/content/rss.php', {
      headers: { 'User-Agent': 'SurvivalHunterSim/1.0' },
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

      const plainDesc = stripHtml(desc);
      if (HUNTER_KEYWORDS.test(title) || HUNTER_KEYWORDS.test(plainDesc)) {
        items.push({
          title,
          link,
          pubDate,
          date: formatDate(pubDate),
          description: truncate(plainDesc, 280),
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

async function fetchWowheadRss(): Promise<PatchNote[]> {
  try {
    const res = await fetch('https://www.wowhead.com/news/rss/blue-tracker', {
      headers: { 'User-Agent': 'SurvivalHunterSim/1.0' },
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

      const plainDesc = stripHtml(desc);
      if (HUNTER_KEYWORDS.test(title) || HUNTER_KEYWORDS.test(plainDesc)) {
        items.push({
          title,
          link,
          pubDate,
          date: formatDate(pubDate),
          description: truncate(plainDesc, 280),
          source: 'Wowhead',
        });
      }
      if (items.length >= 3) break;
    }
    return items;
  } catch (e) {
    console.warn('Wowhead fetch failed:', e);
    return [];
  }
}

async function fetchBlizzardNotes(): Promise<PatchNote[]> {
  try {
    const clientId = Deno.env.get('BLIZZARD_CLIENT_ID');
    const clientSecret = Deno.env.get('BLIZZARD_CLIENT_SECRET');
    if (!clientId || !clientSecret) return [];

    // Get OAuth token
    const tokenRes = await fetch('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) { await tokenRes.text(); return []; }
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Search for hunter-related journal entries
    const searchRes = await fetch(
      `https://us.api.blizzard.com/data/wow/search/journal-encounter?namespace=static-us&locale=en_US&_pageSize=25&access_token=${token}`,
    );
    if (!searchRes.ok) { await searchRes.text(); return []; }
    const searchData = await searchRes.json();

    const items: PatchNote[] = [];
    if (searchData.results) {
      for (const result of searchData.results) {
        const name = result.data?.name?.en_US || '';
        const desc = result.data?.description?.en_US || '';
        if (HUNTER_KEYWORDS.test(name) || HUNTER_KEYWORDS.test(desc)) {
          items.push({
            title: `Encounter Update: ${name}`,
            link: `https://worldofwarcraft.blizzard.com/en-us/news`,
            pubDate: new Date().toISOString(),
            date: formatDate(new Date().toISOString()),
            description: truncate(stripHtml(desc || name), 280),
            source: 'Blizzard',
          });
          if (items.length >= 3) break;
        }
      }
    }
    return items;
  } catch (e) {
    console.warn('Blizzard fetch failed:', e);
    return [];
  }
}

// Simple dedup by title similarity
function dedup(notes: PatchNote[]): PatchNote[] {
  const seen = new Set<string>();
  return notes.filter(n => {
    const key = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// In-memory cache
let cachedResult: { notes: PatchNote[]; lastUpdated: string; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

    // Return cached if valid
    if (!force && cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_TTL) {
      return new Response(JSON.stringify(cachedResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all sources in parallel
    const [mmo, wowhead, blizz] = await Promise.all([
      fetchMmoChampionRss(),
      fetchWowheadRss(),
      fetchBlizzardNotes(),
    ]);

    const allNotes = [...mmo, ...wowhead, ...blizz];

    // Sort by date descending
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
      JSON.stringify({ notes: [], lastUpdated: '', error: 'Failed to fetch patch notes' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
