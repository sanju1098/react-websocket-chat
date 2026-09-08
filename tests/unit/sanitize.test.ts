import { stripHtmlTags } from '../../src/utils/sanitize';

describe('stripHtmlTags', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtmlTags('<b>bold</b> text')).toBe('bold text');
  });

  it('removes script tags and their attributes', () => {
    expect(stripHtmlTags('<script src="evil.js">alert(1)</script>')).toBe('alert(1)');
  });

  it('removes self-closing and attribute-laden tags (e.g. img onerror)', () => {
    expect(stripHtmlTags('<img src=x onerror="alert(1)">Hi')).toBe('Hi');
  });

  it('leaves plain text with punctuation untouched', () => {
    expect(stripHtmlTags('5 is less than 10, right?')).toBe('5 is less than 10, right?');
  });

  it('trims leading/trailing whitespace left behind after stripping tags', () => {
    expect(stripHtmlTags('  <p>hello</p>  ')).toBe('hello');
  });

  it('returns an empty string for tag-only input (edge case)', () => {
    expect(stripHtmlTags('<div></div>')).toBe('');
  });

  it('handles empty string input (edge case)', () => {
    expect(stripHtmlTags('')).toBe('');
  });
});
