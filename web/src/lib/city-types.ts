import cityTypes from "@/data/city_types.json";

export type CityType = {
  code: string;
  nickname: string;
  description: string;
  image: string;
};

export const CITY_TYPES = cityTypes as CityType[];

/** Every code comes from the backend's fixed sixteen, so a miss is a contract break. */
export function getCityType(code: string): CityType {
  return CITY_TYPES.find((type) => type.code === code)!;
}
