// ─────────────────────────────────────────────────────────────
// Tests for APL validation and parsing
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  validateAPL,
  parseAPL,
  DEFAULT_APLS,
  getDefaultAPLKey,
} from "../APLEngine";

describe("validateAPL", () => {
  it("validates a well-formed APL", () => {
    const result = validateAPL(`actions=auto_attack
actions+=/kill_command,if=focus<=80
actions+=/raptor_strike`);
    expect(result.valid).toBe(true);
    expect(result.actionCount).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("detects malformed lines", () => {
    const result = validateAPL(`actions=auto_attack
this is not valid
actions+=/raptor_strike`);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("malformed");
  });

  it("warns on unknown abilities", () => {
    const result = validateAPL(`actions=auto_attack
actions+=/nonexistent_spell`);
    expect(result.valid).toBe(true); // warnings don't make it invalid
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("unknown ability");
  });

  it("warns on unrecognized conditions", () => {
    const result = validateAPL(`actions=auto_attack
actions+=/raptor_strike,if=some_weird_condition>=5`);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes("may not be recognized"))).toBe(true);
  });

  it("returns error for empty APL", () => {
    const result = validateAPL("");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("APL has no valid action lines");
  });

  it("skips comment lines", () => {
    const result = validateAPL(`# This is a comment
// This is also a comment
actions=auto_attack
actions+=/raptor_strike`);
    expect(result.valid).toBe(true);
    expect(result.actionCount).toBe(2);
  });

  it("validates all default APLs", () => {
    for (const [key, apl] of Object.entries(DEFAULT_APLS)) {
      const result = validateAPL(apl);
      expect(result.valid).toBe(true);
      expect(result.actionCount).toBeGreaterThan(0);
      // Default APLs should have no errors
      expect(result.errors).toHaveLength(0);
    }
  });

  it("accepts known condition patterns without warnings", () => {
    const result = validateAPL(`actions=auto_attack
actions+=/raptor_strike,if=focus>=60&buff.tip_of_the_spear.stack>=2
actions+=/serpent_sting,if=!dot.serpent_sting.ticking
actions+=/kill_command,if=cooldown.kill_command.ready`);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("parseAPL", () => {
  it("parses basic APL lines", () => {
    const apl = parseAPL(`actions=auto_attack
actions+=/raptor_strike,if=focus>=50
actions+=/kill_command`);
    expect(apl.actions).toHaveLength(3);
    expect(apl.actions[0].ability).toBe("auto_attack");
    expect(apl.actions[1].ability).toBe("raptor_strike");
    expect(apl.actions[1].conditions).toHaveLength(1);
    expect(apl.actions[2].ability).toBe("kill_command");
    expect(apl.actions[2].conditions).toHaveLength(0);
  });

  it("parses multiple AND conditions", () => {
    const apl = parseAPL(`actions+=/raptor_strike,if=focus>=30&buff.tip_of_the_spear.stack>=2`);
    expect(apl.actions[0].conditions).toHaveLength(2);
    expect(apl.actions[0].conditions[0].raw).toBe("focus>=30");
    expect(apl.actions[0].conditions[1].raw).toBe("buff.tip_of_the_spear.stack>=2");
  });

  it("skips malformed lines", () => {
    const apl = parseAPL(`actions=auto_attack
garbage line
actions+=/kill_command`);
    expect(apl.actions).toHaveLength(2);
  });
});

describe("getDefaultAPLKey", () => {
  it("returns sentinel_raid_st for sentinel + raid_st", () => {
    expect(getDefaultAPLKey("sentinel", "raid_st")).toBe("sentinel_raid_st");
  });

  it("returns pack_leader_raid_st for pack_leader + raid_st", () => {
    expect(getDefaultAPLKey("pack_leader", "raid_st")).toBe("pack_leader_raid_st");
  });

  it("returns mplus_aoe for non-raid fight styles", () => {
    expect(getDefaultAPLKey("sentinel", "mplus_pull")).toBe("sentinel_mplus_aoe");
    expect(getDefaultAPLKey("pack_leader", "mplus_pull")).toBe("pack_leader_mplus_aoe");
  });
});
