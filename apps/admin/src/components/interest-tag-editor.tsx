'use client';

import { useState, useCallback, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface InterestTagEditorProps {
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
}

export function InterestTagEditor({ tags, onSave }: InterestTagEditorProps) {
  const [currentTags, setCurrentTags] = useState<string[]>(tags);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDirty =
    tags.length !== currentTags.length ||
    tags.some((t, i) => t !== currentTags[i]);

  const addTag = useCallback(() => {
    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) return;
    if (currentTags.includes(normalized)) {
      setInputValue('');
      return;
    }
    setCurrentTags((prev) => [...prev, normalized]);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, currentTags]);

  const removeTag = useCallback((tag: string) => {
    setCurrentTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(currentTags);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a topic..."
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="button" size="sm" variant="outline" onClick={addTag}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {currentTags.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No interest topics set.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {currentTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {isDirty && (
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      )}
    </div>
  );
}
