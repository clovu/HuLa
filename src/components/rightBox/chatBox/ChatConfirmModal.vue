<template>
  <n-modal :show="show" @update:show="$emit('update:show', $event)" class="w-350px border-rd-8px">
    <div class="bg-[--bg-popover] w-360px h-full p-6px box-border flex flex-col">
      <!-- macOS 关闭按钮 -->
      <div
        v-if="isMac()"
        @click="$emit('update:show', false)"
        class="mac-close z-999 size-13px shadow-inner bg-#ed6a5eff rounded-50% select-none absolute left-6px">
        <svg class="hidden size-7px color-#000 select-none absolute top-3px left-3px">
          <use href="#close"></use>
        </svg>
      </div>

      <!-- Windows 关闭按钮 -->
      <svg
        v-if="isWindows()"
        @click="$emit('update:show', false)"
        class="w-12px h-12px ml-a cursor-pointer select-none">
        <use href="#close"></use>
      </svg>

      <div class="flex flex-col gap-30px p-[22px_10px_10px_22px] select-none">
        <span class="text-14px">{{ title }}</span>
        <slot />
        <n-flex justify="end">
          <n-button @click="$emit('confirm')" class="w-78px" color="#13987f">
            {{ t('home.chat_main.confirm') }}
          </n-button>
          <n-button @click="$emit('update:show', false)" class="w-78px" secondary>
            {{ t('home.chat_main.cancel') }}
          </n-button>
        </n-flex>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isMac, isWindows } from '@/utils/PlatformConstants'

defineProps<{
  show: boolean
  title: string
}>()

defineEmits<{
  'update:show': [value: boolean]
  confirm: []
}>()

const { t } = useI18n()
</script>
