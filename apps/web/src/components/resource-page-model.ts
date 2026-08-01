type SectionedField = {
  name: string;
  section?: string;
  sectionDescription?: string;
};

export function groupFields<T extends SectionedField>(fields: T[]) {
  const groups: Array<{
    key: string;
    section?: string;
    description?: string;
    fields: T[];
  }> = [];

  for (const field of fields) {
    if (field.section || !groups.length) {
      groups.push({
        key: `${field.section ?? "default"}-${groups.length}`,
        section: field.section,
        description: field.sectionDescription,
        fields: [field],
      });
    } else {
      groups.at(-1)?.fields.push(field);
    }
  }

  return groups;
}
