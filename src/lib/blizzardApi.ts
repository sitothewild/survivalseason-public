import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

async function invokeFunction(functionName: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

// ===================== GAME DATA APIs =====================

export async function getItem(itemId: number, region = "us") {
  return invokeFunction("blizzard-game-data", { action: "item", itemId, region });
}

export async function getItemMedia(itemId: number, region = "us") {
  return invokeFunction("blizzard-game-data", { action: "item-media", itemId, region });
}

export async function searchItems(name: string, region = "us", page = 1) {
  return invokeFunction("blizzard-game-data", { action: "item-search", name, region, page });
}

export async function getItemsBatch(itemIds: number[], region = "us") {
  return invokeFunction("blizzard-game-data", { action: "items-batch", itemIds, region });
}

export async function getSpecialization(specId: number, region = "us") {
  return invokeFunction("blizzard-game-data", { action: "specialization", specId, region });
}

export async function getPlayableClass(classId: number, region = "us") {
  return invokeFunction("blizzard-game-data", { action: "class", classId, region });
}

// ===================== CHARACTER APIs =====================

export async function getCharacterProfile(realmSlug: string, characterName: string, region = "us") {
  return invokeFunction("blizzard-character", { action: "profile", realmSlug, characterName, region });
}

export async function getCharacterEquipment(realmSlug: string, characterName: string, region = "us") {
  return invokeFunction("blizzard-character", { action: "equipment", realmSlug, characterName, region });
}

export async function getCharacterStats(realmSlug: string, characterName: string, region = "us") {
  return invokeFunction("blizzard-character", { action: "stats", realmSlug, characterName, region });
}

export async function getCharacterMedia(realmSlug: string, characterName: string, region = "us") {
  return invokeFunction("blizzard-character", { action: "media", realmSlug, characterName, region });
}

export async function getHunterPets(realmSlug: string, characterName: string, region = "us") {
  return invokeFunction("blizzard-character", { action: "hunter-pets", realmSlug, characterName, region });
}

/** Fetches profile, equipment, stats, media, and hunter pets in one call */
export async function getFullCharacter(realmSlug: string, characterName: string, region = "us") {
  return invokeFunction("blizzard-character", { action: "full", realmSlug, characterName, region });
}

// ===================== HELPERS =====================

/** Convert Blizzard API equipment response to sim-compatible format */
export function equipmentToSimData(fullData: any) {
  const { profile, equipment, stats: charStats } = fullData;
  
  const gear = (equipment?.equipped_items || []).map((item: any) => {
    // Extract enchantments
    const enchantments = (item.enchantments || []).map((e: any) => ({
      id: e.enchantment_id,
      display: e.display_string?.replace(/\|[^|]*\|[a-z]/g, '').replace('Enchanted: ', '') || '',
      name: e.source_item?.name || '',
      slot: e.enchantment_slot?.type || 'PERMANENT',
    }));

    // Extract sockets/gems
    const sockets = (item.sockets || []).map((s: any) => ({
      display: s.display_string || '',
      name: s.item?.name || '',
      itemId: s.item?.id || null,
    }));

    // Extract per-item stats
    const itemStats = (item.stats || [])
      .filter((s: any) => !s.is_negated)
      .map((s: any) => ({
        type: s.type?.type || '',
        name: s.type?.name || '',
        value: s.value || 0,
        isEquipBonus: !!s.is_equip_bonus,
      }));

    return {
      slot: item.slot?.type?.toLowerCase() || "unknown",
      slotLabel: item.slot?.name || item.slot?.type || "Unknown",
      ilvl: item.level?.value || 0,
      itemId: item.item?.id || null,
      name: item.name || "Unknown Item",
      quality: item.quality?.type || "COMMON",
      enchantments,
      sockets,
      itemStats,
      nameDescription: item.name_description?.display_string || '',
    };
  });

  // Extract stats from Blizzard API character statistics
  // The API may return stats in different structures depending on the endpoint version
  // Try multiple paths to ensure we get the most accurate values
  const agility = charStats?.agility?.effective ?? charStats?.agility?.base ?? (charStats?.agility || 0);
  const stamina = charStats?.stamina?.effective ?? charStats?.stamina?.base ?? 0;
  const rawAP = charStats?.attack_power?.effective ?? (typeof charStats?.attack_power === 'number' ? charStats.attack_power : 0);
  const attackPower = rawAP || Math.round((typeof agility === 'number' ? agility : 0) * 1.05);

  // For secondary stats, prefer the percentage value, then calculate from rating
  // Blizzard API may use: melee_crit, spell_crit, or just crit_rating
  let haste = 0, crit = 0, mastery = 0, versatility = 0;

  // Haste: try melee_haste.value (percentage), then ranged_haste, then rating conversion
  haste = charStats?.melee_haste?.value ?? charStats?.ranged_haste?.value ?? charStats?.spell_haste?.value ?? 0;
  if (!haste && charStats?.melee_haste?.rating) haste = +(charStats.melee_haste.rating / 170).toFixed(2);
  if (!haste && charStats?.haste_rating) haste = +(charStats.haste_rating / 170).toFixed(2);

  // Crit: try melee_crit.value, then ranged_crit, then rating
  crit = charStats?.melee_crit?.value ?? charStats?.ranged_crit?.value ?? charStats?.spell_crit?.value ?? 0;
  if (!crit && charStats?.melee_crit?.rating) crit = +(charStats.melee_crit.rating / 170).toFixed(2);
  if (!crit && charStats?.crit_rating) crit = +(charStats.crit_rating / 170).toFixed(2);

  // Mastery
  mastery = charStats?.mastery?.value ?? 0;
  if (!mastery && charStats?.mastery?.rating) mastery = +(charStats.mastery.rating / 170).toFixed(2);
  if (!mastery && charStats?.mastery_rating) mastery = +(charStats.mastery_rating / 170).toFixed(2);

  // Versatility
  versatility = charStats?.versatility_damage_done_bonus ?? 0;
  if (!versatility && charStats?.versatility) {
    const rawVers = typeof charStats.versatility === 'number' ? charStats.versatility : 0;
    versatility = +(rawVers / 205 * 100).toFixed(2);
  }

  // Log raw stats for debugging (visible in browser console)
  console.log('[Armory Stats Debug]', {
    raw: { agility: charStats?.agility, attack_power: charStats?.attack_power, melee_haste: charStats?.melee_haste, melee_crit: charStats?.melee_crit, mastery: charStats?.mastery, versatility: charStats?.versatility, versatility_damage_done_bonus: charStats?.versatility_damage_done_bonus },
    parsed: { agility, attackPower, haste, crit, mastery, versatility },
  });

  const simStats = {
    agility: typeof agility === 'number' ? agility : 0,
    attackPower: typeof attackPower === 'number' ? attackPower : 0,
    haste: +Number(haste).toFixed(2),
    crit: +Number(crit).toFixed(2),
    mastery: +Number(mastery).toFixed(2),
    versatility: +Number(versatility).toFixed(2),
  };

  const avgIlvl = gear.length > 0
    ? Math.round(gear.filter((g: any) => g.ilvl > 0).reduce((s: number, g: any) => s + g.ilvl, 0) / gear.filter((g: any) => g.ilvl > 0).length)
    : 0;

  return {
    character: {
      name: profile?.name || "Unknown",
      level: profile?.level || 80,
      race: profile?.race?.name || "",
      raceId: profile?.race?.id || null,
      gender: profile?.gender?.type || "MALE",
      realm: profile?.realm?.name || "",
      region: "us",
      avgIlvl: profile?.equipped_item_level || avgIlvl,
      class: profile?.character_class?.name || "",
      spec: profile?.active_spec?.name || "",
    },
    stats: simStats,
    gear,
    talents: fullData?.specializations?.active_specialization?.loadouts?.[0]?.talent_loadout_code || null,
    valid: true,
    errors: [],
    media: fullData.media,
    hunterPets: fullData.hunterPets,
  };
}
