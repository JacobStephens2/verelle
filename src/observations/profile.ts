/**
 * The couple's **Profile**: date of birth and the circumstances
 * **Eligibility** depends on (`CONTEXT.md`, ADR 0015, issue #32).
 *
 * Stored under the Shared owner, readable and writable by both partners.
 * Date of birth is stored as a date, never as a computed age.
 */
import type { CivilDate } from "../chart/civil-date";

export interface Profile {
  /**
   * Date of birth, stored as a Civil date (`YYYY-MM-DD`), never as a computed age.
   */
  readonly dateOfBirth: CivilDate | null;
  readonly breastfeeding: boolean | null;
  readonly postpartum: boolean | null;
  readonly perimenopause: boolean | null;
  /**
   * The Civil date (`YYYY-MM-DD`) hormonal contraception was stopped, if applicable.
   */
  readonly hormonalContraceptionStop: CivilDate | null;
}

export type ProfileFields = Profile;

export type ProfileUpdate = {
  -readonly [Field in keyof ProfileFields]?: ProfileFields[Field];
};

/** An empty profile before anything is entered. */
export function defaultProfile(): Profile {
  return {
    dateOfBirth: null,
    breastfeeding: null,
    postpartum: null,
    perimenopause: null,
    hormonalContraceptionStop: null,
  };
}

/**
 * The Profile resulting from merging `update` onto `profile`.
 * Merged per-column so two partners editing different fields both win.
 */
export function applyProfileUpdate(profile: Profile, update: ProfileUpdate): Profile {
  const merged = { ...profile };
  for (const key of Object.keys(update) as Array<keyof ProfileFields>) {
    if (!(key in update)) continue;
    (merged as Record<string, unknown>)[key] = update[key] ?? null;
  }
  return merged;
}

/**
 * The update that writes just `fields` of `values`.
 */
export function profileUpdateOf(
  values: ProfileFields,
  fields: ReadonlySet<keyof ProfileFields>,
): ProfileUpdate {
  const update: ProfileUpdate = {};
  for (const field of fields) {
    (update as Record<string, unknown>)[field] = values[field];
  }
  return update;
}
