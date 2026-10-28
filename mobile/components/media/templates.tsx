/**
 * The brochure layouts as React Native views, ported from the website's
 * src/components/syncmedia/templates. Classic, Editorial, Overlay and Split
 * follow the web layouts closely. Mosaic renders with the Editorial layout
 * (both are a hero over a thumbnail rail) and Spotlight is a compact version
 * of the web layout: a framed photo on the accent colour with a large price.
 */
import { Text, View } from "react-native";
import { formatShape } from "@/lib/syncmedia/formats";
import {
  BrandMark,
  BrandTile,
  ContactLines,
  Placeholder,
  PhotoBox,
  SANS,
  SERIF,
  Slot,
  ThumbStrip,
  WhatsAppBadge,
  usableFeatures,
  usablePhotos,
  type TemplateProps,
} from "./parts";

// ── Classic ────────────────────────────────────────────────────────────

export function Classic({ doc, theme, preset, brand, s }: TemplateProps) {
  const { isWide, isTall } = formatShape(preset);
  const photos = usablePhotos(doc, 4);
  const thumbs = photos.slice(1);
  const features = usableFeatures(doc, isWide ? 4 : 6);
  const pad = isWide ? 52 : 72;
  const titleText = doc.title.trim() || "Property title";
  const titleBase = titleText.length <= 14 ? 97 : titleText.length <= 26 ? 76 : titleText.length <= 40 ? 60 : 50;
  const titleSize = isWide ? titleBase * 0.62 : isTall ? titleBase * 1.15 : titleBase;
  const subSize = isWide ? 34 : isTall ? 58 : 52;
  const priceSize = isWide ? 60 : isTall ? 104 : 90;
  const featureSize = isWide ? 25 : 32;
  const thumbHeight = isWide ? 170 : isTall ? 290 : 254;
  const thumbLift = thumbHeight * 0.58;

  const inTitle = (value: string) => {
    const needle = value.trim().toLowerCase();
    return needle.length > 0 && titleText.toLowerCase().includes(needle);
  };
  const suburb = doc.location.split(",")[0] ?? "";
  const subtitleParts: string[] = [];
  if (doc.eyebrow.trim() && !inTitle(doc.eyebrow)) subtitleParts.push(doc.eyebrow.trim());
  if (suburb.trim() && !inTitle(suburb)) subtitleParts.push(`in ${suburb.trim()}`);
  const subtitle = subtitleParts.join(" ");
  const contactSize = isWide ? 22 : 30;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page, overflow: "hidden" }}>
      {doc.showLogo ? (
        <View style={{ alignItems: "center" }}>
          <Slot
            id="logo"
            doc={doc}
            style={{
              backgroundColor: theme.accent,
              paddingTop: s(20),
              paddingBottom: s(26),
              paddingHorizontal: s(52),
              borderBottomLeftRadius: s(6),
              borderBottomRightRadius: s(6),
            }}
          >
            <BrandMark s={s} color={theme.onAccent} brand={brand} onDark markHeight={isWide ? 52 : 76} wordSize={isWide ? 24 : 36} />
          </Slot>
        </View>
      ) : (
        <View style={{ height: s(pad * 0.5) }} />
      )}

      <Slot id="headline" doc={doc} style={{ paddingTop: s(28), paddingBottom: s(26), paddingHorizontal: s(pad), alignItems: "center", flexShrink: 1, overflow: "hidden" }}>
        <Text style={{ fontFamily: SERIF, fontWeight: "700", fontSize: s(titleSize), lineHeight: s(titleSize * 1.04), color: theme.accent, textAlign: "center" }}>
          {titleText}
        </Text>
        {subtitle ? (
          <Text style={{ marginTop: s(10), fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", fontSize: s(subSize), color: theme.accent, textAlign: "center" }}>
            {subtitle}
          </Text>
        ) : null}
      </Slot>

      <Slot id="hero" doc={doc} style={{ flex: 1, minHeight: s(240), marginHorizontal: s(pad), borderRadius: s(16), overflow: "hidden" }}>
        {photos[0] ? <PhotoBox photo={photos[0]} style={{ flex: 1 }} /> : <Placeholder theme={theme} s={s} style={{ flex: 1 }} />}
      </Slot>

      <View style={{ backgroundColor: theme.accent, paddingBottom: s(30) }}>
        {thumbs.length > 0 ? (
          <Slot id="thumbs" doc={doc} style={{ marginTop: -s(thumbLift), marginHorizontal: s(pad + 46) }}>
            <ThumbStrip
              photos={thumbs}
              vertical={false}
              thickness={s(thumbHeight)}
              radius={s(14)}
              gap={s(37)}
              borderWidth={s(10)}
              borderColor={theme.page}
            />
          </Slot>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: s(30), paddingTop: s(30), paddingHorizontal: s(pad) }}>
          {features.length > 0 ? (
            <Slot id="features" doc={doc} style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", columnGap: s(30), rowGap: s(10), overflow: "hidden" }}>
              {features.map((feature, i) => (
                <View key={i} style={{ width: features.length > 3 ? "46%" : "100%", flexDirection: "row", alignItems: "center", gap: s(14) }}>
                  <View style={{ width: s(10), height: s(10), borderRadius: s(5), backgroundColor: theme.onAccent }} />
                  <Text style={{ flex: 1, fontSize: s(featureSize), color: theme.onAccent }}>{feature}</Text>
                </View>
              ))}
            </Slot>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Slot id="price" doc={doc} style={{ alignItems: "center", flexShrink: 0 }}>
            {doc.priceLabel ? (
              <Text style={{ fontSize: s(isWide ? 20 : 26), fontWeight: "700", color: theme.onAccent }}>{doc.priceLabel.toUpperCase()}:</Text>
            ) : null}
            <Text style={{ marginTop: s(4), fontFamily: SERIF, fontWeight: "700", fontSize: s(priceSize), color: theme.onAccent }}>{doc.price || "—"}</Text>
          </Slot>
        </View>
      </View>

      <Slot
        id="contact"
        doc={doc}
        style={{ backgroundColor: theme.page, paddingVertical: s(18), paddingHorizontal: s(pad), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s(14) }}
      >
        {doc.agentName ? (
          <Text style={{ fontSize: s(contactSize), fontWeight: "700", color: theme.ink }}>CONTACT {doc.agentName.split(" ")[0].toUpperCase()}</Text>
        ) : null}
        {doc.agentPhone ? (
          <>
            {doc.agentName ? <Text style={{ fontSize: s(contactSize), color: theme.ink }}>:</Text> : null}
            {doc.whatsappContact ? <WhatsAppBadge size={s(isWide ? 30 : 40)} bg={theme.accent} fg={theme.page} /> : null}
            <Text style={{ fontSize: s(contactSize), fontWeight: "700", color: theme.ink }}>{doc.agentPhone}</Text>
          </>
        ) : null}
      </Slot>
    </View>
  );
}

// ── Editorial (also used for Mosaic) ───────────────────────────────────

export function Editorial({ doc, theme, preset, brand, s }: TemplateProps) {
  const { isWide, isTall, isPrint } = formatShape(preset);
  const features = usableFeatures(doc, isWide ? 3 : isTall || isPrint ? 6 : 4);
  const pad = isWide ? 56 : 72;
  const titleSize = isWide ? 54 : isTall ? 82 : isPrint ? 74 : 66;
  const photos = usablePhotos(doc, 4);
  const thumbs = photos.slice(1);

  const header = (
    <Slot id="logo" doc={doc} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: s(pad), paddingHorizontal: s(pad), paddingBottom: s(pad * 0.5) }}>
      {doc.showLogo ? <BrandTile size={s(72)} bg={theme.accent} fg={theme.onAccent} radius={s(16)} brand={brand} /> : <View />}
      {doc.reference ? <Text style={{ fontSize: s(22), fontWeight: "700", letterSpacing: s(3), color: theme.inkSoft }}>{doc.reference.toUpperCase()}</Text> : null}
    </Slot>
  );

  const hero = (
    <Slot id="hero" doc={doc} style={{ flex: 1, minHeight: s(200) }}>
      {photos[0] ? <PhotoBox photo={photos[0]} style={{ flex: 1 }} /> : <Placeholder theme={theme} s={s} style={{ flex: 1 }} />}
    </Slot>
  );

  const photo =
    thumbs.length > 0 ? (
      <View style={{ flex: 1, minHeight: s(240), gap: s(10) }}>
        {hero}
        <Slot id="thumbs" doc={doc}>
          <ThumbStrip photos={thumbs} vertical={false} thickness={s(isWide ? 120 : 150)} radius={s(6)} gap={s(10)} />
        </Slot>
      </View>
    ) : (
      hero
    );

  const body = (
    <Slot id="headline" doc={doc} style={{ gap: s(18), paddingVertical: s(pad * 0.72), paddingHorizontal: s(pad), flexShrink: 1, overflow: "hidden" }}>
      {doc.eyebrow ? <Text style={{ fontSize: s(22), fontWeight: "800", letterSpacing: s(5), color: theme.accent }}>{doc.eyebrow.toUpperCase()}</Text> : null}
      <Text style={{ fontFamily: SERIF, fontWeight: "700", fontSize: s(titleSize), lineHeight: s(titleSize * 1.08), color: theme.ink }}>{doc.title || "Property title"}</Text>
      {doc.location ? <Text style={{ fontSize: s(28), color: theme.inkSoft }}>{doc.location}</Text> : null}
      {features.length > 0 ? (
        <Slot id="features" doc={doc} style={{ flexDirection: "row", flexWrap: "wrap", gap: s(12), marginTop: s(6) }}>
          {features.map((feature, i) => (
            <Text
              key={i}
              style={{
                fontSize: s(22),
                fontWeight: "600",
                color: theme.onAccentSoft,
                backgroundColor: theme.accentSoft,
                paddingVertical: s(11),
                paddingHorizontal: s(22),
                borderRadius: s(999),
                overflow: "hidden",
              }}
            >
              {feature}
            </Text>
          ))}
        </Slot>
      ) : null}
    </Slot>
  );

  const footer = (
    <View style={{ backgroundColor: theme.accent, paddingVertical: s(pad * 0.62), paddingHorizontal: s(pad), flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: s(32) }}>
      <Slot id="price" doc={doc} style={{ minWidth: 0, flexShrink: 1 }}>
        {doc.priceLabel ? <Text style={{ fontSize: s(19), fontWeight: "700", letterSpacing: s(3), color: theme.onAccent, opacity: 0.75 }}>{doc.priceLabel.toUpperCase()}</Text> : null}
        <Text style={{ marginTop: s(8), fontFamily: SERIF, fontWeight: "700", fontSize: s(isWide ? 46 : 58), color: theme.onAccent }}>{doc.price || "—"}</Text>
      </Slot>
      <Slot id="contact" doc={doc} style={{ minWidth: 0, flexShrink: 1 }}>
        <ContactLines doc={doc} s={s} color={theme.onAccent} mutedColor={theme.onAccent} behind={theme.accent} align="right" />
      </Slot>
    </View>
  );

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.page, overflow: "hidden" }}>
        <View style={{ width: "44%" }}>{photo}</View>
        <View style={{ width: "56%", justifyContent: "space-between" }}>
          {header}
          {body}
          {footer}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.page, overflow: "hidden" }}>
      {header}
      {photo}
      {body}
      {footer}
    </View>
  );
}

// ── Overlay ────────────────────────────────────────────────────────────

/** Scrim built from stacked bands, since no gradient package is installed. */
function Scrim() {
  const bands: Array<[number, number, number]> = [
    // top, height (fractions), opacity
    [0, 0.12, 0.5],
    [0.12, 0.14, 0.25],
    [0.45, 0.15, 0.15],
    [0.6, 0.12, 0.45],
    [0.72, 0.12, 0.65],
    [0.84, 0.16, 0.85],
  ];
  return (
    <>
      {bands.map(([top, h, o], i) => (
        <View key={i} style={{ position: "absolute", left: 0, right: 0, top: `${top * 100}%`, height: `${h * 100}%`, backgroundColor: `rgba(0,0,0,${o})` }} />
      ))}
    </>
  );
}

export function Overlay({ doc, theme, preset, brand, s }: TemplateProps) {
  const { isWide, isTall } = formatShape(preset);
  const features = usableFeatures(doc, isWide ? 3 : 4);
  const photos = usablePhotos(doc, 3);
  const thumbs = photos.slice(1);
  const pad = isWide ? 56 : 72;
  const titleSize = isWide ? 58 : isTall ? 92 : 74;
  const onPhoto = "#ffffff";

  return (
    <View style={{ flex: 1, backgroundColor: theme.ink, overflow: "hidden" }}>
      {photos[0] ? <PhotoBox photo={photos[0]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} /> : <Placeholder theme={theme} s={s} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />}
      <Scrim />
      <View style={{ flex: 1, justifyContent: "space-between", padding: s(pad) }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: s(24) }}>
          {doc.showLogo ? (
            <Slot id="logo" doc={doc}>
              <BrandTile size={s(76)} bg="rgba(255,255,255,0.16)" fg={onPhoto} radius={s(18)} brand={brand} />
            </Slot>
          ) : (
            <View />
          )}
          {doc.eyebrow ? (
            <Slot id="eyebrow" doc={doc} style={{ backgroundColor: theme.accent, paddingVertical: s(13), paddingHorizontal: s(26), borderRadius: s(999) }}>
              <Text style={{ fontSize: s(22), fontWeight: "800", letterSpacing: s(4), color: theme.onAccent }}>{doc.eyebrow.toUpperCase()}</Text>
            </Slot>
          ) : null}
        </View>

        <View style={{ gap: s(20), maxWidth: isWide ? "72%" : "100%" }}>
          {thumbs.length > 0 ? (
            <Slot id="thumbs" doc={doc}>
              <ThumbStrip photos={thumbs} vertical={false} thickness={s(isWide ? 130 : 170)} radius={s(12)} gap={s(12)} borderWidth={s(4)} borderColor="rgba(255,255,255,0.85)" />
            </Slot>
          ) : null}

          <Slot id="headline" doc={doc}>
            <Text style={{ fontFamily: SERIF, fontWeight: "700", fontSize: s(titleSize), lineHeight: s(titleSize * 1.05), color: onPhoto }}>{doc.title || "Property title"}</Text>
            {doc.location ? <Text style={{ marginTop: s(20), fontSize: s(28), color: "rgba(255,255,255,0.86)" }}>{doc.location}</Text> : null}
          </Slot>

          {features.length > 0 ? (
            <Slot id="features" doc={doc}>
              <Text style={{ fontSize: s(24), fontWeight: "600", color: "rgba(255,255,255,0.94)", lineHeight: s(36) }}>{features.join("   ·   ")}</Text>
            </Slot>
          ) : null}

          <View style={{ marginTop: s(10), paddingTop: s(28), borderTopWidth: s(3), borderTopColor: "rgba(255,255,255,0.28)", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: s(28) }}>
            <Slot id="price" doc={doc} style={{ minWidth: 0, flexShrink: 1 }}>
              {doc.priceLabel ? <Text style={{ fontSize: s(19), fontWeight: "700", letterSpacing: s(3), color: "rgba(255,255,255,0.7)" }}>{doc.priceLabel.toUpperCase()}</Text> : null}
              <Text style={{ marginTop: s(8), fontFamily: SERIF, fontWeight: "700", fontSize: s(isWide ? 50 : 62), color: onPhoto }}>{doc.price || "—"}</Text>
            </Slot>
            <Slot id="contact" doc={doc} style={{ minWidth: 0, flexShrink: 1 }}>
              <ContactLines doc={doc} s={s} color={onPhoto} mutedColor="rgba(255,255,255,0.85)" behind="#111111" align="right" />
            </Slot>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Split ──────────────────────────────────────────────────────────────

export function Split({ doc, theme, preset, brand, s }: TemplateProps) {
  const { isWide, isTall, aspect } = formatShape(preset);
  const horizontal = aspect > 0.95;
  const pad = isWide ? 54 : 68;
  const titleSize = isWide ? 56 : isTall ? 76 : 60;
  const photos = usablePhotos(doc, 3);
  const thumbs = photos.slice(1);
  const features = usableFeatures(doc, isWide ? 3 : horizontal ? 4 : thumbs.length > 0 ? 3 : 5);
  const share = horizontal ? "48%" : thumbs.length > 0 ? "38%" : "46%";
  const sideStyle = horizontal ? { width: share as `${number}%` } : { height: share as `${number}%` };

  const photo =
    photos[0] === undefined ? (
      <Placeholder theme={theme} s={s} style={sideStyle} />
    ) : thumbs.length > 0 ? (
      <View style={[sideStyle, { flexDirection: horizontal ? "column" : "row", gap: s(8) }]}>
        <Slot id="hero" doc={doc} style={{ flex: 1.9, minWidth: 0, minHeight: 0 }}>
          <PhotoBox photo={photos[0]} style={{ flex: 1 }} />
        </Slot>
        <Slot id="thumbs" doc={doc}>
          <ThumbStrip photos={thumbs} vertical={!horizontal} thickness={s(horizontal ? 190 : 220)} radius={0} gap={s(8)} />
        </Slot>
      </View>
    ) : (
      <Slot id="hero" doc={doc} style={sideStyle}>
        <PhotoBox photo={photos[0]} style={{ flex: 1 }} />
      </Slot>
    );

  const panel = (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: theme.accent, padding: s(pad), justifyContent: "space-between", gap: s(28) }}>
      <Slot id="logo" doc={doc} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: s(20) }}>
        {doc.showLogo ? <BrandTile size={s(66)} bg="rgba(255,255,255,0.18)" fg={theme.onAccent} radius={s(16)} brand={brand} /> : <View />}
        {doc.eyebrow ? <Text style={{ fontSize: s(21), fontWeight: "800", letterSpacing: s(4), color: theme.onAccent, opacity: 0.85 }}>{doc.eyebrow.toUpperCase()}</Text> : null}
      </Slot>

      <Slot id="headline" doc={doc} style={{ gap: s(16), flexShrink: 1, overflow: "hidden" }}>
        <Text style={{ fontFamily: SERIF, fontWeight: "700", fontSize: s(titleSize), lineHeight: s(titleSize * 1.07), color: theme.onAccent }}>{doc.title || "Property title"}</Text>
        {doc.location ? <Text style={{ fontSize: s(27), color: theme.onAccent, opacity: 0.82 }}>{doc.location}</Text> : null}
        {features.length > 0 ? (
          <Slot id="features" doc={doc} style={{ marginTop: s(12), paddingTop: s(22), borderTopWidth: s(2), borderTopColor: "rgba(255,255,255,0.25)", gap: s(11) }}>
            {features.map((feature, i) => (
              <Text key={i} style={{ fontSize: s(24), fontWeight: "600", color: theme.onAccent, opacity: 0.95 }}>
                {feature}
              </Text>
            ))}
          </Slot>
        ) : null}
      </Slot>

      <Slot id="price" doc={doc} style={{ flexShrink: 0 }}>
        {doc.priceLabel ? <Text style={{ fontSize: s(18), fontWeight: "700", letterSpacing: s(3), color: theme.onAccent, opacity: 0.7 }}>{doc.priceLabel.toUpperCase()}</Text> : null}
        <Text style={{ marginTop: s(8), marginBottom: s(22), fontFamily: SERIF, fontWeight: "700", fontSize: s(isWide ? 48 : 58), color: theme.onAccent }}>{doc.price || "—"}</Text>
        <Slot id="contact" doc={doc} style={{ paddingTop: s(20), borderTopWidth: s(2), borderTopColor: "rgba(255,255,255,0.25)" }}>
          <ContactLines doc={doc} s={s} color={theme.onAccent} mutedColor={theme.onAccent} behind={theme.accent} nameSize={25} detailSize={23} />
        </Slot>
      </Slot>
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: horizontal ? "row" : "column", backgroundColor: theme.page, overflow: "hidden" }}>
      {photo}
      {panel}
    </View>
  );
}

// ── Spotlight ──────────────────────────────────────────────────────────

export function Spotlight({ doc, theme, preset, brand, s }: TemplateProps) {
  const { isWide, isTall } = formatShape(preset);
  const pad = isWide ? 50 : 64;
  const photos = usablePhotos(doc, 3);
  const thumbs = photos.slice(1);
  const features = usableFeatures(doc, isWide ? 3 : 4);
  const titleSize = isWide ? 46 : isTall ? 74 : 60;

  const frame = (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, gap: s(10) }}>
      <Slot id="hero" doc={doc} style={{ flex: 1, borderWidth: s(10), borderColor: theme.page, borderRadius: s(18), overflow: "hidden" }}>
        {photos[0] ? <PhotoBox photo={photos[0]} style={{ flex: 1 }} /> : <Placeholder theme={theme} s={s} style={{ flex: 1 }} />}
      </Slot>
      {thumbs.length > 0 ? (
        <Slot id="thumbs" doc={doc}>
          <ThumbStrip photos={thumbs} vertical={false} thickness={s(isWide ? 100 : 140)} radius={s(10)} gap={s(10)} borderWidth={s(6)} borderColor={theme.page} />
        </Slot>
      ) : null}
    </View>
  );

  const copy = (
    <View style={{ gap: s(16), flexShrink: 1, minWidth: 0, justifyContent: "center", flex: isWide ? 1 : undefined }}>
      <Slot id="headline" doc={doc} style={{ gap: s(10) }}>
        {doc.eyebrow ? <Text style={{ fontSize: s(21), fontWeight: "800", letterSpacing: s(5), color: theme.onAccent, opacity: 0.85 }}>{doc.eyebrow.toUpperCase()}</Text> : null}
        <Text style={{ fontFamily: SERIF, fontWeight: "700", fontSize: s(titleSize), lineHeight: s(titleSize * 1.06), color: theme.onAccent }}>{doc.title || "Property title"}</Text>
        {doc.location ? <Text style={{ fontSize: s(26), color: theme.onAccent, opacity: 0.82 }}>{doc.location}</Text> : null}
      </Slot>
      <Slot id="price" doc={doc}>
        {doc.priceLabel ? <Text style={{ fontSize: s(19), fontWeight: "700", letterSpacing: s(3), color: theme.onAccent, opacity: 0.75 }}>{doc.priceLabel.toUpperCase()}</Text> : null}
        <Text style={{ marginTop: s(6), fontFamily: SERIF, fontWeight: "700", fontSize: s(isWide ? 62 : 92), color: theme.onAccent }}>{doc.price || "—"}</Text>
      </Slot>
      {features.length > 0 ? (
        <Slot id="features" doc={doc}>
          <Text style={{ fontSize: s(24), fontWeight: "600", color: theme.onAccent, lineHeight: s(36) }}>{features.join("   ·   ")}</Text>
        </Slot>
      ) : null}
      <Slot id="contact" doc={doc}>
        <ContactLines doc={doc} s={s} color={theme.onAccent} mutedColor={theme.onAccent} behind={theme.accent} />
      </Slot>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.accent, padding: s(pad), gap: s(28), flexDirection: isWide ? "row" : "column", overflow: "hidden" }}>
      {doc.showLogo && !isWide ? (
        <Slot id="logo" doc={doc} style={{ alignItems: "flex-start" }}>
          <BrandMark s={s} color={theme.onAccent} brand={brand} onDark markHeight={64} wordSize={34} />
        </Slot>
      ) : null}
      {frame}
      {copy}
    </View>
  );
}
