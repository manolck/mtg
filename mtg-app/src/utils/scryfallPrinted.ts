type ScryfallFace = {
  name?: string;
  printed_name?: string;
  type_line?: string;
  printed_type_line?: string;
  oracle_text?: string;
  printed_text?: string;
};

export function scryfallPrintedName(card: ScryfallFace & { card_faces?: ScryfallFace[] }): string {
  if (card.printed_name) return card.printed_name;
  const faces = card.card_faces;
  if (faces?.some((face) => face.printed_name)) {
    return faces.map((face) => face.printed_name || face.name || '').filter(Boolean).join(' // ');
  }
  return card.name || '';
}

export function scryfallPrintedType(card: ScryfallFace & { card_faces?: ScryfallFace[] }): string {
  if (card.printed_type_line) return card.printed_type_line;
  const faces = card.card_faces;
  if (faces?.some((face) => face.printed_type_line)) {
    return faces.map((face) => face.printed_type_line || face.type_line || '').filter(Boolean).join(' // ');
  }
  return card.type_line || '';
}

export function scryfallPrintedText(face: ScryfallFace): string | undefined {
  return face.printed_text || face.oracle_text;
}
