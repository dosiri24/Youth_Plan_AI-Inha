import cityTypes from "@/data/city_types.json";

export type CityType = {
  code: string;
  nickname: string;
  description: string;
  image: string;
};

export const CITY_TYPES = cityTypes as CityType[];

// The final illustrations are portrait stamp sheets. Fixing the slot to their pixel
// size keeps the card layout from shifting when the sixteen assets are swapped in.
export const TYPE_IMAGE_WIDTH = 1697;
export const TYPE_IMAGE_HEIGHT = 2080;

/** Every code comes from the backend's fixed sixteen, so a miss is a contract break. */
export function getCityType(code: string): CityType {
  return CITY_TYPES.find((type) => type.code === code)!;
}
