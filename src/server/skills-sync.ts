import fs from "node:fs/promises";
import path from "node:path";

export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillItem {
  id?: string;
  name: string;
  description?: string;
  instructions?: string;
  content?: string;
  files?: SkillFile[];
}

export async function syncSkillsToWorkspace(
  effectiveCwd: string,
  skills?: SkillItem[],
): Promise<string[]> {
  if (!Array.isArray(skills) || skills.length === 0) {
    return [];
  }

  const baseSkillsDir = path.join(effectiveCwd, ".agents", "skills");
  await fs.mkdir(baseSkillsDir, { recursive: true });

  const syncedSkillNames: string[] = [];

  for (const skill of skills) {
    if (!skill || !skill.name) continue;

    const skillName = skill.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const skillDir = path.join(baseSkillsDir, skillName);
    await fs.mkdir(skillDir, { recursive: true });

    const description = skill.description ? skill.description.trim() : `Skill: ${skill.name}`;
    const body = skill.instructions ?? skill.content ?? "";

    const skillMdContent = `---
name: ${skillName}
description: ${description.replace(/\n/g, " ")}
---

${body}
`;

    const skillMdPath = path.join(skillDir, "SKILL.md");
    await fs.writeFile(skillMdPath, skillMdContent, "utf-8");

    if (Array.isArray(skill.files)) {
      for (const file of skill.files) {
        if (!file || !file.path) continue;
        const filePath = path.join(skillDir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content ?? "", "utf-8");
      }
    }

    syncedSkillNames.push(skillName);
  }

  return syncedSkillNames;
}
