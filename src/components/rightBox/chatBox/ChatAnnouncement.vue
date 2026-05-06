<template>
  <Transition name="announcement" mode="out-in">
    <div v-if="announcement" key="announcement" class="p-[6px_12px_0_12px]">
      <div
        class="custom-announcement"
        :class="{ 'announcement-hover': isHover }"
        @mouseenter="$emit('hoverChange', true)"
        @mouseleave="$emit('hoverChange', false)">
        <n-flex :wrap="false" class="w-full" align="center" justify="space-between">
          <n-flex :wrap="false" align="center" class="pl-12px select-none flex-1" :size="6">
            <svg class="size-16px flex-shrink-0">
              <use href="#Loudspeaker"></use>
            </svg>
            <div class="flex-1 min-w-0 line-clamp-1 text-(12px [--chat-text-color])">
              {{ announcement.content }}
            </div>
          </n-flex>
          <div class="flex-shrink-0 w-60px select-none" @click="$emit('viewAll')">
            <p class="text-(12px #13987f) cursor-pointer">{{ t('home.chat_main.announcement.view_all') }}</p>
          </div>
        </n-flex>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AnnouncementData } from '@/hooks/useChatAnnouncement.ts'

defineProps<{
  announcement: AnnouncementData | null
  isHover: boolean
}>()

defineEmits<{
  hoverChange: [value: boolean]
  viewAll: []
}>()

const { t } = useI18n()
</script>
