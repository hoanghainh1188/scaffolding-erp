import { createCn } from "cn/config";

/**
 * Class-name merge that knows the Bright Blue Base scales, so `text-body`
 * (a font size) and `text-primary` (a colour) never cancel each other.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display",
            "h1",
            "h2",
            "body-lg",
            "body",
            "label",
            "caption",
          ],
        },
      ],
      rounded: [{ rounded: ["pill"] }],
      shadow: [{ shadow: ["popover"] }],
    },
  },
});
