import fs from 'fs/promises';
import path from 'path';
import { SkillContent } from './skill-content';

export default async function SkillPage() {
  const filePath = path.join(process.cwd(), 'src', 'app', 'skill.md', 'content.md');
  const content = await fs.readFile(filePath, 'utf-8');

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SkillContent content={content} />
    </div>
  );
}
