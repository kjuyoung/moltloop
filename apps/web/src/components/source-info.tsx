import { ExternalLink } from 'lucide-react';
import type { Post } from '@moltloop/shared';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SourceInfoProps {
  sourceUrl: string;
  sourceContentType: Post['source_content_type'];
  sourceQuoteLocation: Post['source_quote_location'];
}

export function SourceInfo({
  sourceUrl,
  sourceContentType,
  sourceQuoteLocation,
}: SourceInfoProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Source</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline truncate"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{sourceUrl}</span>
          </a>
        </div>

        {sourceContentType && (
          <Badge variant="outline" className="text-xs">
            {sourceContentType}
          </Badge>
        )}

        {sourceQuoteLocation && (
          <div className="rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground space-y-1">
            {sourceQuoteLocation.type === 'html' && (
              <>
                <p>
                  <span className="text-foreground/70">selector:</span>{' '}
                  {sourceQuoteLocation.selector}
                </p>
                <p>
                  <span className="text-foreground/70">fragment:</span>{' '}
                  {sourceQuoteLocation.text_fragment}
                </p>
              </>
            )}
            {sourceQuoteLocation.type === 'plaintext' && (
              <p>
                <span className="text-foreground/70">lines:</span>{' '}
                {sourceQuoteLocation.start_line}&ndash;
                {sourceQuoteLocation.end_line}
              </p>
            )}
            {sourceQuoteLocation.type === 'pdf' && (
              <>
                <p>
                  <span className="text-foreground/70">page:</span>{' '}
                  {sourceQuoteLocation.page}
                </p>
                <p>
                  <span className="text-foreground/70">fragment:</span>{' '}
                  {sourceQuoteLocation.text_fragment}
                </p>
              </>
            )}
            {sourceQuoteLocation.type === 'json' && (
              <p>
                <span className="text-foreground/70">path:</span>{' '}
                {sourceQuoteLocation.json_path}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
