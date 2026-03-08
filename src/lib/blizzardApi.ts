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
  
  const gear = (equipment?.equipped_items || []).map((item: any) => ({
    slot: item.slot?.type?.toLowerCase() || "unknown",
    slotLabel: item.slot?.name || item.slot?.type || "Unknown",
    ilvl: item.level?.value || 0,
    itemId: item.item?.id || null,
    name: item.name || "Unknown Item",
    quality: item.quality?.type || "COMMON",
  }));

  // Extract stats from Blizzard API character statistics
  const agility = charStats?.agility?.effective || 0;
  const attackPower = charStats?.attack_power || agility * 2.1;
  const hasteRating = charStats?.melee_haste?.rating || 0;
  const critRating = charStats?.melee_crit?.rating || 0;
  const masteryRating = charStats?.mastery?.rating || 0;
  const versRating = charStats?.versatility || 0;

  const simStats = {
    agility,
    attackPower,
    haste: +(hasteRating / 180).toFixed(2),
    crit: +(critRating / 180).toFixed(2),
    mastery: +(masteryRating / 180).toFixed(2),
    versatility: +(versRating / 205).toFixed(2),
  };

  // Use effective percentages if available
  if (charStats?.melee_haste?.value) simStats.haste = +(charStats.melee_haste.value).toFixed(2);
  if (charStats?.melee_crit?.value) simStats.crit = +(charStats.melee_crit.value).toFixed(2);
  if (charStats?.mastery?.value) simStats.mastery = +(charStats.mastery.value).toFixed(2);
  if (charStats?.versatility_damage_done_bonus) simStats.versatility = +(charStats.versatility_damage_done_bonus).toFixed(2);

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
    talents: null,
    valid: true,
    errors: [],
    media: fullData.media,
    hunterPets: fullData.hunterPets,
  };
}
