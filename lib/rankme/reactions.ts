// One complete emoji, including flags, skin tones and joined emoji families.
const emojiPattern = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)$/u;
export function validReaction(value: string) {
  return value.length <= 32 && emojiPattern.test(value) &&
    Array.from(new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(value)).length === 1;
}
export const defaultReactions = ['❤️','👍','👎','😠'];
export type Reaction = {emoji:string;count:number;mine:boolean};
export function changeDemoReaction(items:Reaction[],emoji:string|null) {
  const updated=items.map(r=>({...r,count:r.count-(r.mine?1:0),mine:false}));
  if(emoji){const found=updated.find(r=>r.emoji===emoji);if(found){found.count++;found.mine=true}else updated.push({emoji,count:1,mine:true})}
  return updated.filter(r=>r.count>0);
}
