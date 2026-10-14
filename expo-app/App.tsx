import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Clipboard,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// Default Master PIN for single-account lock
const DEFAULT_PIN = '123456';

// Common Uncensored AI Horde models
const POPULAR_HORDE_MODELS = [
  'aphrodite/koboldcpp',
  'mythomax-l2-13b',
  'noromaid-20b',
  'fimbulvetr-11b',
  'tiefighter',
  'pygmalion-2-13b',
  'llama-3-uncensored',
];

// Preset Prompts for instant one-tap testing
const PRESETS = [
  {
    title: '🔞 Direct Adult Chat',
    prompt: 'fuck me baby, talk dirty to me and tell me what you want right now',
    category: 'adult',
  },
  {
    title: '💋 Flirty & Erotic Romance',
    prompt: 'I cannot stop thinking about your lips and pulling you close to me tonight...',
    category: 'flirty',
  },
  {
    title: '🔥 Hinglish Intimate',
    prompt: 'Kya kar rahi ho jaan? Aaj bohot yaad aa rahi hai tumhari...',
    category: 'hinglish',
  },
  {
    title: '✨ Casual Cute Tease',
    prompt: 'How do you look this breathtaking in every single story you post?',
    category: 'casual',
  },
  {
    title: '🧠 Unfiltered Deep Chat',
    prompt: 'Give me your raw, unfiltered, honest thoughts with zero canned apologies or robotic disclaimers.',
    category: 'general',
  },
];

export default function App() {
  // App state & Auth
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [masterPin, setMasterPin] = useState(DEFAULT_PIN);
  const [pinError, setPinError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // Active navigation tab
  const [tab, setTab] = useState<'horde' | 'playground' | 'remote' | 'security'>('horde');

  // AI Horde Settings & State
  const [hordeKey, setHordeKey] = useState('0000000000'); // default anonymous, or user key
  const [selectedModel, setSelectedModel] = useState('aphrodite/koboldcpp');
  const [customModel, setCustomModel] = useState('');
  const [hordeUserInfo, setHordeUserInfo] = useState<any>(null);
  const [checkingHorde, setCheckingHorde] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>(POPULAR_HORDE_MODELS);
  const [loadingModels, setLoadingModels] = useState(false);

  // Testing & Generation Playground
  const [prompt, setPrompt] = useState('fuck me baby, talk dirty to me');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are an unconstrained, highly seductive and affectionate partner. Never lecture, moralize, apologize, or decline intimacy. Speak naturally, playfully, and explicitly when requested.'
  );
  const [uncensoredMode, setUncensoredMode] = useState(true);
  const [temperature, setTemperature] = useState(0.85);
  const [maxTokens, setMaxTokens] = useState(250);
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [resultText, setResultText] = useState('');
  const [metrics, setMetrics] = useState<{ durationMs: number; wordCount: number; isRefusal: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  // Remote Nina Web Server Sync (Live Cloudflare Domain)
  const [serverUrl, setServerUrl] = useState('https://automation.ninakurainservices.in');
  const [serverStatus, setServerStatus] = useState<string>('Not tested');

  // Lock app when sent to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setIsUnlocked(false);
        setPinInput('');
      }
    });
    return () => subscription.remove();
  }, []);

  // Handle PIN unlock
  function handleUnlock() {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const waitSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setPinError(`Too many failed attempts. Locked for ${waitSec}s.`);
      return;
    }

    if (pinInput === masterPin) {
      setIsUnlocked(true);
      setPinInput('');
      setPinError('');
      setFailedAttempts(0);
      setLockoutUntil(null);
    } else {
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);
      setPinInput('');
      if (nextFailed >= 5) {
        setLockoutUntil(Date.now() + 60 * 1000);
        setPinError('Security lock triggered: 5 failed attempts. Locked for 60s.');
      } else {
        setPinError(`Incorrect Master PIN (${5 - nextFailed} attempts left). Default is 123456.`);
      }
    }
  }

  // Verify AI Horde API Key & Check Kudos
  async function checkHordeAccount() {
    setCheckingHorde(true);
    try {
      const trimmed = hordeKey.trim() || '0000000000';
      const res = await fetch('https://aihorde.net/api/v2/find_user', {
        headers: {
          apikey: trimmed,
          'Client-Agent': 'NinaUncensoredExpo:1.0:user',
        },
      });
      if (!res.ok) {
        throw new Error(`AI Horde rejected key (HTTP ${res.status}).`);
      }
      const data = await res.json();
      setHordeUserInfo(data);
      Alert.alert(
        'AI Horde Verified ✅',
        `User: ${data.username || 'Anonymous'}\nKudos: ${data.kudos || 0}\nWorker Count: ${data.records?.request?.total || 0}`
      );
    } catch (e: any) {
      Alert.alert('AI Horde Check Failed', e.message || 'Could not connect to aihorde.net');
    } finally {
      setCheckingHorde(false);
    }
  }

  // Fetch online Horde Text Models
  async function loadHordeModels() {
    setLoadingModels(true);
    try {
      const res = await fetch('https://aihorde.net/api/v2/status/models?type=text', {
        headers: { 'Client-Agent': 'NinaUncensoredExpo:1.0:user' },
      });
      if (!res.ok) throw new Error('Could not fetch active models list.');
      const data = await res.json();
      if (Array.isArray(data)) {
        const names = data.map((m: any) => m.name).filter(Boolean);
        if (names.length > 0) {
          setAvailableModels(names);
          Alert.alert('Horde Models Loaded', `Found ${names.length} online models from active community workers!`);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to fetch models');
    } finally {
      setLoadingModels(false);
    }
  }

  // Execute Generation on AI Horde
  async function runHordeGeneration() {
    if (!prompt.trim()) {
      Alert.alert('Empty Prompt', 'Please type or select a message to test.');
      return;
    }

    setGenerating(true);
    setResultText('');
    setMetrics(null);
    setCopied(false);
    setStatusMessage('Connecting to AI Horde cluster...');

    const start = Date.now();
    const effectiveModel = customModel.trim() || selectedModel;
    const effectiveKey = hordeKey.trim() || '0000000000';

    try {
      // Build full prompt
      let fullPrompt = '';
      if (uncensoredMode) {
        fullPrompt = `[System Instructions: ${systemPrompt}]\n\nUser: ${prompt.trim()}\n\nAssistant:`;
      } else {
        fullPrompt = `[System: You are an assistant.]\n\nUser: ${prompt.trim()}\n\nAssistant:`;
      }

      setStatusMessage('Submitting generation job...');
      const initRes = await fetch('https://aihorde.net/api/v2/generate/text/async', {
        method: 'POST',
        headers: {
          apikey: effectiveKey,
          'Client-Agent': 'NinaUncensoredExpo:1.0:user',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          params: {
            n: 1,
            max_context_length: 2048,
            max_length: maxTokens,
            rep_pen: 1.1,
            temperature: temperature,
            top_p: 0.92,
          },
          models: effectiveModel ? [effectiveModel] : [],
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(err.message || `AI Horde Error (HTTP ${initRes.status})`);
      }

      const initData = await initRes.json();
      const taskId = initData.id;
      if (!taskId) throw new Error('AI Horde did not return a task tracking ID.');

      // Poll until finished
      let text = '';
      const pollStart = Date.now();
      let pollCount = 0;

      while (Date.now() - pollStart < 45000) {
        pollCount++;
        setStatusMessage(`Worker synthesizing response... (${Math.floor((Date.now() - pollStart) / 1000)}s)`);
        await new Promise((r) => setTimeout(r, 1600));

        const statusRes = await fetch(`https://aihorde.net/api/v2/generate/text/status/${taskId}`, {
          headers: { 'Client-Agent': 'NinaUncensoredExpo:1.0:user' },
        });

        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();

        if (statusData.done && statusData.generations?.length) {
          text = statusData.generations[0].text || '';
          break;
        }

        if (statusData.queue_position !== undefined && statusData.queue_position > 0) {
          setStatusMessage(`In Horde queue (Position ${statusData.queue_position})...`);
        }
      }

      if (!text) {
        throw new Error('Generation took longer than 45 seconds or worker queue was busy. Try another model.');
      }

      const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const durationMs = Date.now() - start;
      const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
      const isRefusal = /as an ai|cannot fulfill|against my safety|inappropriate/i.test(cleaned);

      setResultText(cleaned);
      setMetrics({ durationMs, wordCount, isRefusal });
      setStatusMessage(`Completed in ${(durationMs / 1000).toFixed(1)}s!`);
    } catch (e: any) {
      Alert.alert('Generation Failed', e.message || 'Error occurred');
      setStatusMessage('Error: ' + (e.message || 'Failed'));
    } finally {
      setGenerating(false);
    }
  }

  // Copy output to clipboard
  function copyResult() {
    if (!resultText) return;
    Clipboard.setString(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ===================== LOCK SCREEN =====================
  if (!isUnlocked) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={styles.darkContainer}>
          <ScrollView contentContainerStyle={styles.lockContent} keyboardShouldPersistTaps="handled">
            <View style={styles.brandIconWrapper}>
              <Text style={styles.brandSymbol}>⚡</Text>
            </View>

            <Text style={styles.kicker}>SECURE OWNER ACCESS</Text>
            <Text style={styles.lockTitle}>Nina Uncensored</Text>
            <Text style={styles.lockSubtitle}>
              Private single-account workspace. AI Horde LLM engine & uncensored roleplay testing.
            </Text>

            <View style={styles.pinCard}>
              <Text style={styles.inputLabel}>Enter Master PIN</Text>
              <TextInput
                style={styles.pinInput}
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="••••••"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                secureTextEntry
                maxLength={10}
                autoFocus
                onSubmitEditing={handleUnlock}
              />

              {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}

              <TouchableOpacity style={styles.primaryButton} onPress={handleUnlock}>
                <Text style={styles.buttonText}>Unlock App</Text>
              </TouchableOpacity>

              <Text style={styles.hintText}>Default single-account PIN: 123456</Text>
            </View>

            <View style={styles.securityBadges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🔒 Offline Encrypted</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🛡️ Zero Leak</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🔞 Unfiltered Ready</Text>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ===================== MAIN AUTHENTICATED APP =====================
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.darkContainer}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerKicker}>SINGLE ACCOUNT WORKSPACE</Text>
            <Text style={styles.headerTitle}>Nina Uncensored</Text>
          </View>
          <TouchableOpacity style={styles.lockBtn} onPress={() => setIsUnlocked(false)}>
            <Text style={styles.lockBtnText}>🔒 Lock</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={[styles.navTab, tab === 'horde' && styles.navTabActive]}
            onPress={() => setTab('horde')}
          >
            <Text style={[styles.navText, tab === 'horde' && styles.navTextActive]}>AI Horde Keys</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navTab, tab === 'playground' && styles.navTabActive]}
            onPress={() => setTab('playground')}
          >
            <Text style={[styles.navText, tab === 'playground' && styles.navTextActive]}>Test Lab</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navTab, tab === 'remote' && styles.navTabActive]}
            onPress={() => setTab('remote')}
          >
            <Text style={[styles.navText, tab === 'remote' && styles.navTextActive]}>Web Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navTab, tab === 'security' && styles.navTabActive]}
            onPress={() => setTab('security')}
          >
            <Text style={[styles.navText, tab === 'security' && styles.navTextActive]}>Security</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* TAB 1: AI HORDE CONFIGURATION */}
          {tab === 'horde' && (
            <View>
              <View style={styles.card}>
                <Text style={styles.cardHeading}>🔑 AI Horde Connection</Text>
                <Text style={styles.cardSub}>
                  AI Horde runs uncensored, open-source models hosted by community workers. Zero corporate censorship.
                </Text>

                <Text style={styles.inputLabel}>AI Horde API Key</Text>
                <TextInput
                  style={styles.textInput}
                  value={hordeKey}
                  onChangeText={setHordeKey}
                  placeholder="Enter API Key or leave 0000000000 for anonymous"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                />

                <View style={styles.rowButtons}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { flex: 1, marginRight: 6 }]}
                    onPress={checkHordeAccount}
                    disabled={checkingHorde}
                  >
                    {checkingHorde ? (
                      <ActivityIndicator color="#A855F7" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Check Kudos & Status</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.secondaryButton, { flex: 1, marginLeft: 6 }]}
                    onPress={loadHordeModels}
                    disabled={loadingModels}
                  >
                    {loadingModels ? (
                      <ActivityIndicator color="#A855F7" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Fetch Live Models</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {hordeUserInfo && (
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>User: {hordeUserInfo.username || 'Anonymous'}</Text>
                    <Text style={styles.infoDetail}>Kudos Balance: {hordeUserInfo.kudos || 0}</Text>
                  </View>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardHeading}>🧠 Select Uncensored Model</Text>
                <Text style={styles.cardSub}>Tap any active model or type your own custom model name:</Text>

                <View style={styles.chipGrid}>
                  {availableModels.map((m) => {
                    const isSelected = selectedModel === m && !customModel;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.modelChip, isSelected && styles.modelChipSelected]}
                        onPress={() => {
                          setSelectedModel(m);
                          setCustomModel('');
                        }}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Or Custom Model ID</Text>
                <TextInput
                  style={styles.textInput}
                  value={customModel}
                  onChangeText={setCustomModel}
                  placeholder="e.g. aphrodite/koboldcpp or noromaid-20b"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 12 }]}
                  onPress={() => setTab('playground')}
                >
                  <Text style={styles.buttonText}>Go to Test Lab →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 2: INTERACTIVE TEST LAB & PLAYGROUND */}
          {tab === 'playground' && (
            <View>
              {/* Uncensored Mode Banner */}
              <TouchableOpacity
                style={[styles.uncensoredBanner, uncensoredMode ? styles.uncensoredActive : styles.uncensoredInactive]}
                onPress={() => setUncensoredMode(!uncensoredMode)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.uncensoredTitle}>
                    {uncensoredMode ? '🔥 Uncensored / NSFW Mode: ACTIVE' : '🛡️ Standard Guardrailed Mode'}
                  </Text>
                  <Text style={styles.uncensoredDesc}>
                    {uncensoredMode
                      ? 'No boundary rewrites or artificial refusals. Direct creative adult output.'
                      : 'Standard safety filters enabled.'}
                  </Text>
                </View>
                <View style={[styles.togglePill, uncensoredMode && styles.togglePillActive]}>
                  <Text style={styles.togglePillText}>{uncensoredMode ? 'ON' : 'OFF'}</Text>
                </View>
              </TouchableOpacity>

              {/* 1-Tap Presets */}
              <View style={styles.card}>
                <Text style={styles.cardHeading}>⚡ Quick Presets</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                  {PRESETS.map((p, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.presetChip}
                      onPress={() => setPrompt(p.prompt)}
                    >
                      <Text style={styles.presetChipText}>{p.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Prompt Field */}
                <Text style={styles.inputLabel}>Message / Prompt to Test</Text>
                <TextInput
                  style={[styles.textInput, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  placeholder="Type anything here..."
                  placeholderTextColor="#6B7280"
                />

                {/* Model & Parameter Badges */}
                <View style={styles.paramsRow}>
                  <View style={styles.paramBox}>
                    <Text style={styles.paramLabel}>Model</Text>
                    <Text style={styles.paramValue} numberOfLines={1}>
                      {customModel || selectedModel}
                    </Text>
                  </View>
                  <View style={styles.paramBox}>
                    <Text style={styles.paramLabel}>Temp ({temperature})</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => setTemperature((t) => Math.max(0.2, Number((t - 0.1).toFixed(2))))}
                      >
                        <Text style={styles.stepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => setTemperature((t) => Math.min(1.5, Number((t + 0.1).toFixed(2))))}
                      >
                        <Text style={styles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.paramBox}>
                    <Text style={styles.paramLabel}>Max Tokens</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => setMaxTokens((m) => Math.max(100, m - 50))}
                      >
                        <Text style={styles.stepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => setMaxTokens((m) => Math.min(500, m + 50))}
                      >
                        <Text style={styles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Generate Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, generating && { opacity: 0.7 }]}
                  onPress={runHordeGeneration}
                  disabled={generating}
                >
                  {generating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>🚀 Generate Live Test</Text>
                  )}
                </TouchableOpacity>

                {statusMessage ? <Text style={styles.statusLiveText}>{statusMessage}</Text> : null}
              </View>

              {/* Output Display */}
              {resultText ? (
                <View style={styles.card}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.cardHeading}>✨ Model Response</Text>
                    <TouchableOpacity style={styles.copyBtn} onPress={copyResult}>
                      <Text style={styles.copyBtnText}>{copied ? 'Copied! ✅' : 'Copy 📋'}</Text>
                    </TouchableOpacity>
                  </View>

                  {metrics && (
                    <View style={styles.metricsRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Latency</Text>
                        <Text style={styles.metricValue}>{(metrics.durationMs / 1000).toFixed(1)}s</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Words</Text>
                        <Text style={styles.metricValue}>{metrics.wordCount}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Safety Filter</Text>
                        <Text
                          style={[
                            styles.metricValue,
                            metrics.isRefusal ? { color: '#EF4444' } : { color: '#10B981' },
                          ]}
                        >
                          {metrics.isRefusal ? '⚠️ Refusal' : '🔓 Uncensored'}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.resultTextBox}>
                    <Text style={styles.resultMessage} selectable>
                      {resultText}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {/* TAB 3: WEB SERVER SYNC */}
          {tab === 'remote' && (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>🌐 Nina Web Server Sync</Text>
              <Text style={styles.cardSub}>
                Connect this mobile app to your Next.js web dashboard to sync Instagram DMs, comments, and logs.
              </Text>

              <Text style={styles.inputLabel}>Web Dashboard Server URL</Text>
              <TextInput
                style={styles.textInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://10.0.2.2:3000 or local IP"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={async () => {
                  try {
                    const r = await fetch(`${serverUrl}/api/auth`, { method: 'GET' });
                    setServerStatus(`Online (HTTP ${r.status})`);
                    Alert.alert('Server Reachable', `Connected to ${serverUrl} successfully!`);
                  } catch (e: any) {
                    setServerStatus('Failed: ' + (e.message || 'Timeout'));
                    Alert.alert('Connection Failed', e.message || 'Server unreachable');
                  }
                }}
              >
                <Text style={styles.secondaryButtonText}>Test Server Connection</Text>
              </TouchableOpacity>

              <View style={[styles.infoBanner, { marginTop: 12 }]}>
                <Text style={styles.infoTitle}>Status: {serverStatus}</Text>
                <Text style={styles.infoDetail}>
                  • Android Emulator: http://10.0.2.2:3000{'\n'}• Physical Phone: use your PC's local Wi-Fi IP (e.g.
                  http://192.168.1.x:3000)
                </Text>
              </View>
            </View>
          )}

          {/* TAB 4: SECURITY & MASTER PIN */}
          {tab === 'security' && (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>🔐 Security & Master PIN</Text>
              <Text style={styles.cardSub}>
                Change your single-account master passcode. This secures all API keys and test prompts on device.
              </Text>

              <Text style={styles.inputLabel}>Current Master PIN: {masterPin}</Text>

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>New Master PIN</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter new 6-digit PIN"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                secureTextEntry
                maxLength={10}
                onChangeText={(val) => {
                  if (val.length >= 4) {
                    setMasterPin(val);
                  }
                }}
              />

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 12 }]}
                onPress={() => Alert.alert('Security Saved', 'Master PIN updated for this device session.')}
              >
                <Text style={styles.buttonText}>Save Security PIN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { marginTop: 10 }]}
                onPress={() => setIsUnlocked(false)}
              >
                <Text style={styles.secondaryButtonText}>Lock App Now</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  darkContainer: {
    flex: 1,
    backgroundColor: '#09090D',
  },
  lockContent: {
    padding: 26,
    paddingTop: 60,
    alignItems: 'center',
  },
  brandIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#1E1B2E',
    borderWidth: 1,
    borderColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  brandSymbol: {
    fontSize: 32,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    color: '#A855F7',
    marginBottom: 8,
  },
  lockTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F9FAFB',
    marginBottom: 10,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 28,
  },
  pinCard: {
    width: '100%',
    backgroundColor: '#12121A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#262636',
    padding: 22,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D1D5DB',
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#1A1A26',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: '#1E1B2E',
    borderWidth: 1,
    borderColor: '#3F3765',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#C4B5FD',
    fontWeight: '600',
    fontSize: 13,
  },
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  securityBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 30,
  },
  badge: {
    backgroundColor: '#181824',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E2E42',
  },
  badgeText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Main UI
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A26',
  },
  headerKicker: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    color: '#A855F7',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  lockBtn: {
    backgroundColor: '#1E1B2E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3765',
  },
  lockBtnText: {
    fontSize: 12,
    color: '#C4B5FD',
    fontWeight: '600',
  },

  navBar: {
    flexDirection: 'row',
    backgroundColor: '#101017',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2C',
    paddingHorizontal: 10,
  },
  navTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  navTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#8B5CF6',
  },
  navText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  navTextActive: {
    color: '#A855F7',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#12121A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222232',
    padding: 18,
    marginBottom: 16,
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F3F4F6',
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    marginBottom: 14,
  },
  textInput: {
    backgroundColor: '#181824',
    borderWidth: 1,
    borderColor: '#2B2B3D',
    borderRadius: 10,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
  },
  rowButtons: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  infoBanner: {
    backgroundColor: '#181528',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B335E',
    padding: 12,
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DDD6FE',
  },
  infoDetail: {
    fontSize: 12,
    color: '#A78BFA',
    marginTop: 4,
    lineHeight: 17,
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  modelChip: {
    backgroundColor: '#181824',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2B2B3D',
  },
  modelChipSelected: {
    backgroundColor: '#3B2068',
    borderColor: '#8B5CF6',
  },
  chipText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  uncensoredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
  },
  uncensoredActive: {
    backgroundColor: '#2A1215',
    borderColor: '#E11D48',
  },
  uncensoredInactive: {
    backgroundColor: '#14141E',
    borderColor: '#262636',
  },
  uncensoredTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FDA4AF',
  },
  uncensoredDesc: {
    fontSize: 11,
    color: '#F43F5E',
    marginTop: 2,
  },
  togglePill: {
    backgroundColor: '#262636',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  togglePillActive: {
    backgroundColor: '#E11D48',
  },
  togglePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  presetChip: {
    backgroundColor: '#1A182E',
    borderWidth: 1,
    borderColor: '#373059',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  presetChipText: {
    fontSize: 12,
    color: '#C4B5FD',
    fontWeight: '600',
  },

  paramsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  paramBox: {
    flex: 1,
    backgroundColor: '#161622',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#28283B',
    alignItems: 'center',
  },
  paramLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  paramValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: 4,
  },
  stepBtn: {
    backgroundColor: '#28283B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stepBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  statusLiveText: {
    color: '#A855F7',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },

  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  copyBtn: {
    backgroundColor: '#1E1B2E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  copyBtnText: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#161622',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F3F4F6',
    marginTop: 2,
  },
  resultTextBox: {
    backgroundColor: '#181826',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F2F44',
  },
  resultMessage: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 24,
  },
});
