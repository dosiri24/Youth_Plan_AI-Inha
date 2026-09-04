import cityTypes from "@/data/city_types.json";

/** The neighbour is stored as a code so a renamed nickname cannot break the pairing. */
type CityTypeRelation = {
  code: string;
  reason: string;
};

export type CityType = {
  code: string;
  nickname: string;
  description: string;
  story: string;
  match: CityTypeRelation;
  mismatch: CityTypeRelation;
  image: string;
};

export const CITY_TYPES = cityTypes as CityType[];

// The final illustrations are portrait stamp sheets. Fixing the slot to their pixel
// size keeps the card layout from shifting when the sixteen assets are swapped in.
export const TYPE_IMAGE_WIDTH = 835;
export const TYPE_IMAGE_HEIGHT = 1024;

/** Every code comes from the backend's fixed sixteen, so a miss is a contract break. */
export function getCityType(code: string): CityType {
  return CITY_TYPES.find((type) => type.code === code)!;
}
