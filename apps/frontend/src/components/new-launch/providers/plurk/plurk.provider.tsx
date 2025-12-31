'use client';

import {
    PostComment,
    withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { PlurkDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/plurk.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { FC } from 'react';

const PLURK_QUALIFIERS = [
    // Official Plurk qualifiers mapped to English keys for reliability
    { value: ':', label: '(Nothing / 自由發揮)' },
    { value: 'plays', label: '玩' },
    { value: 'buys', label: '買' },
    { value: 'sells', label: '賣' },
    { value: 'loves', label: '愛' },
    { value: 'likes', label: '喜歡' },
    { value: 'shares', label: '分享' },
    { value: 'hates', label: '討厭' },
    { value: 'wants', label: '想要' },
    { value: 'wishes', label: '期待' },
    { value: 'needs', label: '需要' },
    { value: 'has', label: '已經' },
    { value: 'will', label: '打算' },
    { value: 'hopes', label: '希望' },
    { value: 'asks', label: '問' },
    { value: 'wonders', label: '好奇' },
    { value: 'feels', label: '覺得' },
    { value: 'thinks', label: '想' },
    { value: 'draws', label: '畫' },
    { value: 'is', label: '正在' },
    { value: 'says', label: '說' },
    { value: 'eats', label: '吃' },
    { value: 'writes', label: '寫' },
];

const PLURK_LANGUAGES = [
    { value: 'tr_ch', label: 'Traditional Chinese (繁體中文)' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: 'Japanese (日本語)' },
];

const PlurkSettings: FC = () => {
    const { register } = useSettings();

    return (
        <div className="flex flex-col gap-[20px] mb-[20px]">
            <Select
                label="Qualifier (噗文格式)"
                {...register('qualifier', {
                    value: ':',
                })}
            >
                {PLURK_QUALIFIERS.map((q) => (
                    <option key={q.value} value={q.value}>
                        {q.label}
                    </option>
                ))}
            </Select>

            <Select
                label="Language (語言設定)"
                {...register('lang', {
                    value: 'tr_ch',
                })}
            >
                {PLURK_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                        {l.label}
                    </option>
                ))}
            </Select>
        </div>
    );
};

export default withProvider({
    postComment: PostComment.POST,
    minimumCharacters: [],
    CustomPreviewComponent: undefined,
    SettingsComponent: PlurkSettings,
    dto: PlurkDto,
    checkValidity: async (posts) => {
        return true;
    },
    maximumCharacters: () => {
        return 360;
    },
});
