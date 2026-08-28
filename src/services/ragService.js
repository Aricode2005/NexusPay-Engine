import { ChatOpenAI } from '@langchain/openai';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';
import { VectorStore } from '@langchain/core/vectorstores';
import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import pool from '../config/db.js';




class MemoryVectorStore extends VectorStore {
    constructor(embeddings) {
        super(embeddings, {});
        /** @type {{ embedding: number[], document: Document }[]} */
        this.vectors = [];
    }

    _vectorstoreType() {
        return 'memory';
    }

    
    async addVectors(vectors, documents) {
        for (let i = 0; i < vectors.length; i++) {
            this.vectors.push({
                embedding: vectors[i],
                document: documents[i],
            });
        }
    }

  
    async addDocuments(documents) {
        const texts = documents.map((doc) => doc.pageContent);
        const embeddings = await this.embeddings.embedDocuments(texts);
        await this.addVectors(embeddings, documents);
    }

   
    async similaritySearchVectorWithScore(queryVector, k, _filter) {
        const scored = this.vectors.map((entry) => {
            const score = cosineSim(queryVector, entry.embedding);
            return { document: entry.document, score };
        });

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, k).map((r) => [r.document, r.score]);
    }

    static async fromDocuments(docs, embeddings) {
        const store = new MemoryVectorStore(embeddings);
        await store.addDocuments(docs);
        return store;
    }
}


function cosineSim(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}



/** @type {ChatOpenAI | null} */
let llm = null;

/** @type {HuggingFaceInferenceEmbeddings | null} */
let embeddings = null;


/** @type {Map<string, { store: MemoryVectorStore, timestamp: number }>} */
const userVectorStoreCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes


const CASUAL_PROMPT = ChatPromptTemplate.fromTemplate(
    `You are NexusPay AI, a friendly financial assistant for the NexusPay digital wallet application.

The user has sent a casual or greeting message. Respond naturally and warmly.
If they greet you, greet them back and briefly mention you can help with transaction queries.
Do NOT show any transaction data unless explicitly asked.
Keep your response short (1-2 sentences).

User Message: {input}

Response:`
);


function isCasualQuery(query) {
    const q = query.toLowerCase().trim();
    const casualPatterns = [
        /^(hi|hey|hello|hola|sup|yo|hii+|heyy+|helloo+)[\s!?.]*$/,
        /^(good\s*(morning|afternoon|evening|night))[\s!?.]*$/,
        /^(how\s*are\s*you|what'?s?\s*up|howdy)[\s!?.]*$/,
        /^(thanks?|thank\s*you|thx|ty)[\s!?.]*$/,
        /^(bye|goodbye|see\s*you|cya|later)[\s!?.]*$/,
        /^(who\s*are\s*you|what\s*can\s*you\s*do|help)[\s!?.]*$/,
        /^(ok|okay|alright|sure|cool|nice|great)[\s!?.]*$/,
    ];
    return casualPatterns.some((p) => p.test(q));
}

const RAG_PROMPT = ChatPromptTemplate.fromTemplate(
    `You are NexusPay AI, a helpful and accurate financial assistant for the NexusPay digital wallet application.

Your job is to answer the user's question about their transactions using ONLY the transaction records provided below.

Rules:
- Use ONLY the provided transaction records to answer. Do NOT make up data.
- If the records don't contain enough information, say so honestly.
- Format all currency amounts in Indian Rupees (₹) with proper formatting.
- Be concise, accurate, and helpful.
- Use bullet points or numbered lists when showing multiple transactions.
- When the user says "I" or "my", they are the wallet owner whose records are shown below.
- For aggregate questions (totals, counts), calculate from ALL relevant records in the context.
- Always mention dates when listing transactions.

Transaction Records:
{context}

User Question: {input}

Answer:`
);


export const initializeRAG = async () => {
    try {
        console.log('[RAG] Initializing LangChain RAG pipeline...');

        llm = new ChatOpenAI({
            modelName: 'Qwen/Qwen2.5-7B-Instruct',
            apiKey: process.env.HUGGINGFACE_API_KEY,
            configuration: {
                baseURL: 'https://router.huggingface.co/featherless-ai/v1/',
            },
            maxRetries: 2,
            temperature: 0.1,
            maxTokens: 1024,
        });

        embeddings = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HUGGINGFACE_API_KEY,
            model: 'sentence-transformers/all-MiniLM-L6-v2',
        });

        await embeddings.embedQuery('connection test');
        console.log('[RAG] ✅ Embeddings model (all-MiniLM-L6-v2) connected.');
        console.log('[RAG] ✅ LLM (Qwen/Qwen2.5-7B-Instruct) configured.');
        console.log('[RAG] ✅ RAG pipeline ready (Embeddings + VectorStore + LLM).');
    } catch (error) {
        console.error('[RAG] ❌ Initialization error:', error.message);
        console.error('[RAG] The server will start, but /ai/chat will fail until this is resolved.');
    }
};

export const queryRAG = async (query, userId) => {
    try {
        if (!llm || !embeddings) {
            throw new Error(
                'RAG pipeline not initialized. Check HUGGINGFACE_API_KEY and restart the server.'
            );
        }

       
        if (isCasualQuery(query)) {
            console.log(`[RAG] Casual query detected: "${query}" — skipping RAG pipeline.`);
            const casualChain = CASUAL_PROMPT.pipe(llm).pipe(new StringOutputParser());
            const greeting = await casualChain.invoke({ input: query });
            return greeting;
        }

       
        console.log(`[RAG] Transaction query detected: "${query}" — running full RAG pipeline.`);
        const vectorStore = await getOrBuildVectorStore(userId);

        if (!vectorStore) {
            return "You don't have any transactions yet. Once you make transfers, I'll be able to answer questions about your spending and transaction history.";
        }

        const retriever = vectorStore.asRetriever({ k: 15 });
        const relevantDocs = await retriever.invoke(query);

        console.log(
            `[RAG] Retrieved ${relevantDocs.length} relevant documents for query: "${query}"`
        );

        const context = relevantDocs
            .map((doc) => doc.pageContent)
            .join('\n\n---\n\n');


        const ragChain = RAG_PROMPT.pipe(llm).pipe(new StringOutputParser());

        const answer = await ragChain.invoke({
            context: context,
            input: query,
        });

        console.log('[RAG] ✅ LLM generated response successfully.');
        return answer;
    } catch (error) {
        console.error('[RAG] Query error:', error);
        throw new Error('Failed to process your query: ' + error.message);
    }
};


async function getOrBuildVectorStore(userId) {
    const cached = userVectorStoreCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[RAG] Cache hit — reusing vector store for user ${userId}`);
        return cached.store;
    }

    console.log(`[RAG] Cache miss — building vector store for user ${userId}...`);

    const documents = await fetchTransactionDocuments(userId);

    if (documents.length === 0) {
        return null;
    }

    const store = await MemoryVectorStore.fromDocuments(documents, embeddings);

    console.log(
        `[RAG] ✅ Vector store built with ${documents.length} transaction documents.`
    );

    userVectorStoreCache.set(userId, {
        store,
        timestamp: Date.now(),
    });

    return store;
}


async function fetchTransactionDocuments(userId) {

    const txQuery = `
        SELECT 
            t.id, t.order_id, t.amount, t.status, t.timestamp,
            t.sender_handle, t.receiver_handle,
            t.sender_bank_name, t.receiver_bank_name,
            s.full_name AS sender_name,
            r.full_name AS receiver_name
        FROM transactions t
        JOIN users s ON t.sender_id = s.id
        JOIN users r ON t.receiver_id = r.id
        WHERE (t.sender_id = $1 OR t.receiver_id = $1)
          AND t.status = 'SUCCESS'
        ORDER BY t.timestamp DESC;
    `;
    const txResult = await pool.query(txQuery, [userId]);
    const transactions = txResult.rows;

    if (transactions.length === 0) {
        return [];
    }

    const userRes = await pool.query(
        'SELECT full_name FROM users WHERE id = $1',
        [userId]
    );
    const userName = userRes.rows[0]?.full_name || 'Unknown User';

   
    const documents = [];

    for (const tx of transactions) {
        const date = new Date(tx.timestamp).toLocaleString('en-IN', {
            dateStyle: 'full',
            timeStyle: 'short',
        });
        const amount = parseFloat(tx.amount).toLocaleString('en-IN');
        const isSender =
            tx.sender_name.toLowerCase() === userName.toLowerCase();
        const txType = isSender
            ? 'DEBIT (You sent money)'
            : 'CREDIT (You received money)';

        const pageContent = [
            `Transaction on ${date}:`,
            `Sender: ${tx.sender_name} (Handle: ${tx.sender_handle})`,
            `Receiver: ${tx.receiver_name} (Handle: ${tx.receiver_handle})`,
            `Amount: ₹${amount}`,
            `Status: ${tx.status}`,
            `Order ID: ${tx.order_id || 'N/A'}`,
            `Type: ${txType}`,
            `Sender Bank: ${tx.sender_bank_name}`,
            `Receiver Bank: ${tx.receiver_bank_name}`,
        ].join('\n');

        documents.push(
            new Document({
                pageContent,
                metadata: {
                    txId: tx.id,
                    orderId: tx.order_id,
                    amount: parseFloat(tx.amount),
                    status: tx.status,
                    date: tx.timestamp,
                    senderName: tx.sender_name,
                    receiverName: tx.receiver_name,
                    type: isSender ? 'DEBIT' : 'CREDIT',
                },
            })
        );
    }

    return documents;
}