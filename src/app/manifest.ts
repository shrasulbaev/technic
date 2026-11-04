import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Technic — грузоперевозки и спецтехника",
    short_name: "Technic",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F4EF",
    theme_color: "#F5F4EF",
    lang: "ru",
  };
}
