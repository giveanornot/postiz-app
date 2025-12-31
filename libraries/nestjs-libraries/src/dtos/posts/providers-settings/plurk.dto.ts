import { IsString, IsOptional, IsIn } from 'class-validator';

export class PlurkDto {
    @IsString()
    @IsOptional()
    identifier: string;

    @IsString()
    @IsOptional()
    @IsIn([
        // Official Plurk qualifiers
        ':', 'plays', 'buys', 'sells', 'loves', 'likes', 'shares', 'hates',
        'wants', 'wishes', 'needs', 'has', 'will', 'hopes', 'asks', 'wonders',
        'feels', 'thinks', 'draws', 'is', 'says', 'eats', 'writes',
        // Support Chinese characters as well just in case
        '玩', '買', '賣', '愛', '喜歡', '分享', '討厭',
        '想要', '期待', '需要', '已經', '打算', '希望',
        '問', '好奇', '覺得', '想', '是', '正在', '說', '吃', '寫'
    ])
    qualifier?: string;

    @IsString()
    @IsOptional()
    @IsIn(['tr_ch', 'en', 'ja'])
    lang?: string;
}
